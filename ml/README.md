# Textreme ML

Components for training and deploying iMessage response generation models.

## Quick Start

### 1. Setup

```bash
# install dependencies
uv sync

# authenticate with Modal
uv run modal setup
```

**Set up Modal secrets** at https://modal.com/secrets:
- `my-huggingface-secret` - HuggingFace API token from https://huggingface.co/settings/tokens
- `wandb` - Weights & Biases API key from https://wandb.ai/settings

**Accept model terms**: Visit https://huggingface.co/meta-llama/Llama-3.1-8B and click "Agree"

### 2. Prepare Training Data

```bash
# extract your recent iMessages (already done if you have recent_conversations/)
cd data
python extract_recent_messages.py

# convert conversations to training format
uv run python prepare_data.py

# options:
#   --context-size 5           # messages to use as context (default: 5)
#   --max-files 10             # limit conversations for testing
#   --include-all              # predict all messages (not just yours)
#   --output training_data.jsonl
```

Creates JSONL format: `{"context": "previous messages...", "response": "next message"}`

### 3. Train

```bash
# start training (1-3 hours on 2x H200)
uv run modal run -m ml.training.train --data=data/training_data.jsonl

# or preprocess only (for testing)
uv run modal run -m ml.training.train --data=data/training_data.jsonl --preproc-only
```

Monitor at https://wandb.ai/


## Configuration

All config is in `training/llama-3.1-8b.yml`. Key settings:

```yaml
# model
base_model: meta-llama/Llama-3.1-8B
sequence_len: 4096  # context window

# dataset (must match your JSONL fields)
datasets:
  - path: data.jsonl
    type:
      field_input: context
      field_output: response

# hyperparameters
learning_rate: 0.0001
num_epochs: 4
micro_batch_size: 4
gradient_accumulation_steps: 4

# W&B
wandb_project: textreme-message-prediction
```

Hard-coded in scripts:
- WANDB always enabled
- LoRA adapters always merged after training
- GPU: 2x H200 training, 1x A10G preprocessing/merge

## Troubleshooting

**CUDA OOM**: Reduce `micro_batch_size` in YAML or increase GPUs in `training/train.py`

**Dataset too small**: Use `--context-size 3` for more examples (needs ~100+ examples)

**Import errors**: Check Modal secrets are set up correctly

**Model quality bad**: Increase data, tune hyperparameters, check W&B metrics

## Structure

```
ml/
├── data/
│   ├── extract_recent_messages.py    # extract iMessages
│   ├── prepare_data.py                # conversation → JSONL
│   └── recent_conversations/          # extracted conversations
├── training/
│   ├── common.py                      # Modal config
│   ├── train.py                       # training orchestration
│   └── llama-3.1-8b.yml              # training config
└── pyproject.toml                     # dependencies
```

## Advanced

**List training runs**:
```bash
modal volume ls textreme-runs-vol
```

**Change GPU config** in `training/train.py`:
```python
GPU_CONFIG = "h200:4"  # use 4x H200 instead of 2x
```
