# Snapshot Pipeline Output Format

## Overview

The snapshot pipeline creates a JSON file with weekly memory snapshots for each contact. For each week in the last 6 months, it looks back 6 months from that week's end date and generates summaries.

## JSON Structure

```json
[
  {
    "contact_id": "+14159716732",
    "contact_name": "+14159716732",
    "phone_number": "+14159716732",
    "metadata": {
      "total_messages_last_6_months": 1234,
      "texting_style": {
        "avg_message_length": 85.2,
        "median_message_length": 45.0,
        "max_message_length": 500,
        "min_message_length": 3,
        "avg_words_per_message": 12.5,
        "median_words_per_message": 8.0,
        "emoji_frequency": 0.35,
        "top_emojis": ["😂", "👍", "🙏"],
        "avg_response_time_minutes": 15.3,
        "median_response_time_minutes": 8.5,
        "messages_per_conversation": 12.8,
        "most_active_hours": [10, 14, 20],
        "typical_days_active": ["Monday", "Wednesday", "Friday"]
      },
      "generated_at": "2025-11-09T10:30:00.000000"
    },
    "weekly_snapshots": {
      "2025-05-12": {
        "snapshot_date": "2025-05-18",
        "lookback_range": {
          "start": "2024-11-18",
          "end": "2025-05-18"
        },
        "message_count": 456,
        "weekly_summaries": [
          {
            "week": "2024-W47",
            "message_count": 23,
            "summary": "Discussed their new role at OpenAI...",
            "date_range": "2024-11-18 to 2024-11-24"
          },
          {
            "week": "2024-W48",
            "message_count": 15,
            "summary": "Made plans to visit SF...",
            "date_range": "2024-11-25 to 2024-12-01"
          }
          // ... more weekly summaries
        ],
        "overall_summary": "Over the past 6 months, our conversations have centered around their transition to OpenAI and settling into San Francisco. They joined the Safety team in late November, working closely with Paul Christiano on alignment research. We've discussed their apartment search extensively - they ultimately chose a place in the Mission District near Dolores Park. Multiple conversations about their adaptation to the AI safety field, transitioning from their previous role at Google Brain. We made plans to meet up several times, including dinner at State Bird Provisions in January and hiking in Marin in March. They've been navigating the challenges of the new role while also exploring the Bay Area scene, frequently mentioning new restaurants and social events in the tech community."
      },
      "2025-05-19": {
        "snapshot_date": "2025-05-25",
        "lookback_range": {
          "start": "2024-11-25",
          "end": "2025-05-25"
        },
        "message_count": 461,
        "weekly_summaries": [
          // Week by week for this snapshot period
        ],
        "overall_summary": "..."
      }
      // ... more weekly snapshots through present day
    }
  }
  // ... more contacts
]
```

## Key Features

1. **Weekly Snapshots**: Each week gets its own key (first day of week in YYYY-MM-DD format)

2. **Rolling 6-Month Window**: Each snapshot looks back 6 months from the week's end date, so you can see how the memory context evolves over time

3. **Contact Metadata**: Includes texting style analysis and statistics about the contact

4. **Detailed Summaries**: 
   - Week-by-week summaries with specific details (names, places, events)
   - Overall prose summary that reads like a memory narrative

5. **Temporal Evolution**: By comparing snapshots across different weeks, you can see how the 6-month memory window changes as new conversations happen and old ones fall out of the window

## Use Cases

- **Context-Aware Messaging**: When composing a message, reference the most recent snapshot to see what you've discussed in the last 6 months
- **Relationship Tracking**: See how relationships evolve by comparing snapshots over time
- **Memory Recall**: Quickly recall specific details (names, places, plans) from past conversations
- **Pattern Analysis**: Identify communication patterns and relationship dynamics over time

## Running the Pipeline

```bash
# Generate snapshots for top 10 contacts
python pipeline.py --mode snapshot --top 10 --output my_memories.json

# Generate snapshots for top 5 contacts
python pipeline.py --mode snapshot --top 5 --output snapshots.json
```

