# Textreme ML

Components for training and deploying iMessage response generation models.

## Setup

```bash
# install dependencies
uv sync
```

## Trained models
- Highly overlapped batches, reply/reaction false positives: run name = `textreme-2025-11-09-07-10-52-a800`, [wandb link](https://wandb.ai/connorff-stanford/textreme-message-prediction/runs/ah1g81wc)
- Fewer examples, fewer epochs, no timestamps: run name = `textreme-2025-11-09-12-03-58-3e66`, [wandb link](https://wandb.ai/connorff-stanford/textreme-message-prediction/runs/95mv6qga)
- Fewer examples, fewer epochs, with timestamps: run name = `textreme-2025-11-09-12-05-15-f1b4`, [wandb link](https://wandb.ai/connorff-stanford/textreme-message-prediction/runs/m788s88y)
- Most active contacts, no timestamps, minor metadata bug: run name = `textreme-2025-11-09-13-24-37-38f9`, [wandb link](https://wandb.ai/connorff-stanford/textreme-message-prediction/runs/986gin28)
- Most active contacts, no timestamps: run name = `textreme-2025-11-09-13-11-45-3967`, [wandb link](https://wandb.ai/connorff-stanford/textreme-message-prediction/runs/986gin28)
- Most active contacts, no timestamps, 4 epochs, stabilize learning rate, potential overfit: run name = `textreme-2025-11-09-14-13-20-fe40`, [wandb link](https://wandb.ai/connorff-stanford/textreme-message-prediction/runs/69jlqnnt)
- Most active contacts, no timestamps, 1 epoch: run name = `textreme-2025-11-09-14-51-14-54c5`, [wandb link](https://wandb.ai/connorff-stanford/textreme-message-prediction/runs/gt5fl8pp)
