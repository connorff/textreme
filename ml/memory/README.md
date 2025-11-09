# Memory Pipeline

Generate memory summaries from iMessage conversations to enable context-aware messaging.

## Overview

The Memory Pipeline analyzes your iMessage conversations and creates detailed memory summaries that can be used to provide context when composing messages. It has two modes:

### Snapshot Mode (New, Default)

Creates weekly "memory snapshots" where each week looks back 6 months from that week's end date. This provides a rolling window view of your conversation history.

**Key Features:**
- **Weekly snapshots** for the last 6 months
- **Rolling 6-month lookback** window per snapshot
- **Week-by-week summaries** with specific facts (names, places, events)
- **Overall prose summary** of each 6-month period
- **Contact metadata** including texting style analysis
- **Two-level parallelization** (contacts + snapshots)
- **Multi-key API support** with automatic failover
- **Automatic checkpointing** - resume from interruptions
- **Single JSON output** file

**Output:** `memory_snapshots.json`

### Legacy Mode

The original pipeline that creates comprehensive memory profiles for each contact.

**Key Features:**
- Weekly and monthly summaries
- Specific moments extraction
- Relationship analysis
- Texting style profiling
- Individual JSON files per contact

**Output:** Directory with per-contact JSON files

## Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Set up OpenAI API key(s)
export OPENAI_API_KEY="your-api-key"

# Or use multiple keys for parallel processing
export OPENAI_API_KEY_1="key1"
export OPENAI_API_KEY_2="key2"
```

## Usage

### Snapshot Mode (Recommended)

```bash
# Generate snapshots for top 10 contacts (default: 3 contacts × 8 snapshots = 24 parallel threads)
# Checkpointing enabled by default - automatically resumes if interrupted!
python3 pipeline.py

# Or explicitly specify snapshot mode
python3 pipeline.py --mode snapshot --top 10 --output my_snapshots.json

# Maximum parallelization (aggressive, requires 2 API keys)
python3 pipeline.py --mode snapshot --top 10 --contact-workers 5 --snapshot-workers 10

# Conservative parallelization (safer for rate limits)
python3 pipeline.py --mode snapshot --top 10 --contact-workers 2 --snapshot-workers 5

# Start fresh (ignore checkpoint, re-process all contacts)
python3 pipeline.py --mode snapshot --top 10 --no-resume

# For testing with fewer contacts
python3 pipeline.py --mode snapshot --top 2 --output test.json
```

### Legacy Mode

```bash
# Generate legacy format
python3 pipeline.py --mode legacy --top 20 --output ./my_memories

# With custom worker count
python3 pipeline.py --mode legacy --top 20 --workers 5 --output ./memories
```

### Command Line Options

```
--mode, -m              Pipeline mode: 'snapshot' (default) or 'legacy'
--output, -o            Output path (file for snapshot, directory for legacy)
--top, -n               Number of top contacts to process (default: 10)
--workers, -w           Number of parallel workers for legacy mode (default: 10)
--contact-workers       Snapshot: # of contacts in parallel (default: 3)
--snapshot-workers      Snapshot: # of snapshots/contact in parallel (default: 8)
--no-resume             Snapshot: Start fresh, ignore checkpoint (default: resume)
--api-key               OpenAI API key (or set OPENAI_API_KEY env var)
--db-path               Path to chat.db (default: ~/Library/Messages/chat.db)
```

**Parallelization Guide for Snapshot Mode:**
- Default: 3 contacts × 8 snapshots = **24 concurrent threads**
- With 2 API keys: Can handle ~48 requests/min per key = ~96 requests/min total
- Aggressive: `--contact-workers 5 --snapshot-workers 10` = 50 threads (needs 2+ API keys)
- Conservative: `--contact-workers 2 --snapshot-workers 5` = 10 threads (single key OK)

**Checkpointing (Snapshot Mode):**
- Automatically saves progress after each contact
- Resume from where you left off if interrupted (ctrl-c, crash, etc.)
- Checkpoint file: `{output_file}_checkpoint.json`
- Use `--no-resume` to ignore checkpoint and start fresh

## Output Format

### Snapshot Mode Output

See [SNAPSHOT_FORMAT.md](./SNAPSHOT_FORMAT.md) for detailed documentation.

```json
[
  {
    "contact_id": "+14159716732",
    "contact_name": "+14159716732",
    "phone_number": "+14159716732",
    "metadata": {
      "total_messages_last_6_months": 1234,
      "texting_style": { ... },
      "generated_at": "2025-11-09T10:30:00"
    },
    "weekly_snapshots": {
      "2025-05-12": {
        "snapshot_date": "2025-05-18",
        "lookback_range": {
          "start": "2024-11-18",
          "end": "2025-05-18"
        },
        "message_count": 456,
        "weekly_summaries": [ ... ],
        "overall_summary": "Comprehensive prose summary..."
      }
    }
  }
]
```

### Legacy Mode Output

Individual JSON files per contact in the output directory, plus a `memory_summary.json` with all contacts.

## Testing

```bash
# Quick test with 2 contacts
python3 test_snapshot_pipeline.py
```

## How It Works

### Snapshot Pipeline

1. **Contact Selection**: Identifies top N contacts by message volume in last 6 months
2. **Checkpoint Loading**: Loads checkpoint if exists, identifies already-completed contacts
3. **Week Identification**: Divides last 6 months into weekly periods (~26 weeks)
4. **Parallel Processing**: 
   - **Level 1**: Process multiple contacts simultaneously (default: 3)
   - **Level 2**: Within each contact, process multiple weekly snapshots in parallel (default: 8)
   - **Total**: Default 3 × 8 = 24 concurrent API calls
5. **Rolling Window**: For each week:
   - Takes the week's end date as reference point
   - Looks back 6 months from that date
   - Retrieves all messages in that window
6. **Summary Generation**: For each window:
   - Chunks messages into weeks
   - Generates detailed summaries per week (with specific names, places, events)
   - Creates overall prose summary of the 6-month period
7. **Checkpointing**: After each contact completes:
   - Saves results to checkpoint file
   - Marks contact as completed
   - Thread-safe updates with locks
8. **Metadata**: Analyzes texting style across all messages
9. **Output**: Saves all snapshots to a single JSON file, removes checkpoint

**Multi-Key Support**: The pipeline automatically uses both API keys when configured, with smart rate limit handling and automatic failover.

**Automatic Resume**: If interrupted (ctrl-c, crash, network), simply re-run the same command and it will skip already-completed contacts and continue from where it left off.

### Why Snapshot Mode?

The snapshot approach provides several advantages:

- **Temporal Context**: See how your conversation context evolves over time
- **Memory Window**: Each snapshot shows exactly what you knew at that point in time
- **Pattern Recognition**: Compare snapshots to identify relationship changes
- **Context-Aware Messaging**: Use the most recent snapshot to inform message composition
- **Efficient Storage**: Single file with all temporal data

## Performance

**Snapshot Mode (Parallelized):**
- **Default (3×8 threads)**: ~2-4 minutes per contact with 2 API keys
- **Aggressive (5×10 threads)**: ~1-2 minutes per contact with 2+ API keys
- **Conservative (2×5 threads)**: ~5-8 minutes per contact with 1 API key
- Processing 10 contacts with default settings: ~20-40 minutes total

**Legacy Mode:**
- Parallel processing with default 10 workers
- ~5-10 minutes per contact depending on message volume

**Rate Limit Tips:**
- Use 2+ API keys for best performance: `export OPENAI_API_KEY_1="..." OPENAI_API_KEY_2="..."`
- The pipeline automatically switches keys on rate limits
- Adjust parallelization based on your API tier (see --contact-workers and --snapshot-workers)

## Requirements

- macOS with iMessage (chat.db access)
- Python 3.8+
- OpenAI API key
- Dependencies: openai, tqdm, python-dotenv

## Privacy

All processing happens locally. Messages are sent to OpenAI's API only for summarization. No data is stored externally except for the generated summaries you create.

## Examples

See the `my_memories/` directory for example output files.

## Documentation

- **[README.md](README.md)** - This file (user guide)
- **[SNAPSHOT_FORMAT.md](SNAPSHOT_FORMAT.md)** - Output format reference
- **[PARALLELIZATION.md](PARALLELIZATION.md)** - Deep dive into parallelization architecture
- **[CHECKPOINTING.md](CHECKPOINTING.md)** - Complete guide to checkpoint/resume functionality
- **[BEFORE_AFTER.md](BEFORE_AFTER.md)** - Performance comparisons

## Troubleshooting

**Rate Limits**: Use multiple API keys (OPENAI_API_KEY_1, OPENAI_API_KEY_2, etc.)

**Database Access**: Ensure Full Disk Access is granted to Terminal/your IDE in System Preferences > Security & Privacy

**Memory Errors**: Reduce the number of contacts with `--top N`

**Interrupted Run**: Just re-run the same command - checkpointing will resume automatically

**Want Fresh Start**: Use `--no-resume` to ignore checkpoint and start from scratch

## License

MIT
