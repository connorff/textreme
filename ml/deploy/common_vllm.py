from pathlib import PurePosixPath
from typing import Union

import modal

APP_NAME = "textreme-no-tags"

MINUTES = 60  # seconds
HOURS = 60 * MINUTES

# vllm image for inference
vllm_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "vllm==0.6.3.post1",
        "huggingface_hub==0.26.2",
    )
)

app = modal.App(
    APP_NAME,
    secrets=[
        modal.Secret.from_name("textreme-huggingface-secret"),
    ],
)

# volumes for pre-trained models and training runs
pretrained_volume = modal.Volume.from_name("textreme-pretrained-vol", create_if_missing=True)
runs_volume = modal.Volume.from_name("textreme-runs-vol", create_if_missing=True)

VOLUME_CONFIG: dict[Union[str, PurePosixPath], modal.Volume] = {
    "/pretrained": pretrained_volume,
    "/runs": runs_volume,
}


class Colors:
    """ANSI color codes for terminal output"""
    BLUE = "\033[94m"
    GREEN = "\033[92m"
    GRAY = "\033[90m"
    BOLD = "\033[1m"
    END = "\033[0m"

