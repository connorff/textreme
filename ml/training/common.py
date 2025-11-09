from pathlib import PurePosixPath
from typing import Union

import modal

APP_NAME = "textreme"

MINUTES = 60  # seconds
HOURS = 60 * MINUTES

# axolotl image hash corresponding to main-20240705-py3.11-cu121-2.3.0
AXOLOTL_REGISTRY_SHA = (
    "9578c47333bdcc9ad7318e54506b9adaf283161092ae780353d506f7a656590a"
)

axolotl_image = (
    modal.Image.from_registry(f"winglian/axolotl@sha256:{AXOLOTL_REGISTRY_SHA}")
    .pip_install(
        "huggingface_hub==0.23.2",
        "hf-transfer==0.1.5",
        "wandb==0.16.3",
        "fastapi==0.110.0",
        "pydantic==2.6.3",
    )
    .env(
        dict(
            HUGGINGFACE_HUB_CACHE="/pretrained",
            HF_HUB_ENABLE_HF_TRANSFER="1",
            TQDM_DISABLE="true",
            AXOLOTL_NCCL_TIMEOUT="60",
        )
    )
    .entrypoint([])
)


app = modal.App(
    APP_NAME,
    secrets=[
        modal.Secret.from_name("textreme-huggingface-secret"),
        modal.Secret.from_name("textreme-wandb-secret"),
    ],
)

# volumes for pre-trained models and training runs
pretrained_volume = modal.Volume.from_name("textreme-pretrained-vol", create_if_missing=True)
runs_volume = modal.Volume.from_name("textreme-runs-vol", create_if_missing=True)

VOLUME_CONFIG: dict[Union[str, PurePosixPath], modal.Volume] = {
    "/pretrained": pretrained_volume,
    "/runs": runs_volume,
}
