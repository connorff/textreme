import os
from datetime import datetime
from pathlib import Path
import secrets

from .common import (
    app,
    axolotl_image,
    HOURS,
    MINUTES,
    VOLUME_CONFIG,
)

# hard-coded GPU configs
GPU_CONFIG = "h200:4"  # 4x H200 for training (faster than A100)
SINGLE_GPU_CONFIG = "a10g:1"  # single A10G for preprocessing and merging


@app.function(
    image=axolotl_image,
    gpu=GPU_CONFIG,
    volumes=VOLUME_CONFIG,
    timeout=24 * HOURS,
)
def train(run_folder: str, output_dir: str):
    import torch

    print(f"Starting training run in {run_folder}.")
    print(f"Using {torch.cuda.device_count()} {torch.cuda.get_device_name()} GPU(s).")

    cmd = f"accelerate launch --num_processes {torch.cuda.device_count()} --num_machines 1 --mixed_precision no --dynamo_backend no -m axolotl.cli.train ./config.yml"

    run_cmd(cmd, run_folder)

    # kick off CPU job to merge the LoRA weights into base model (hard-coded: always merge)
    merge_handle = merge.spawn(run_folder, output_dir)

    with open(f"{run_folder}/logs.txt", "a") as f:
        f.write(f"<br>merge: https://modal.com/logs/call/{merge_handle.object_id}\n")
        print(f"Beginning merge {merge_handle.object_id}.")

    return merge_handle


@app.function(
    image=axolotl_image,
    gpu=SINGLE_GPU_CONFIG,
    volumes=VOLUME_CONFIG,
    timeout=24 * HOURS,
)
def preproc_data(run_folder: str):
    print("Preprocessing data.")
    run_cmd(
        "python -W ignore:::torch.nn.modules.module -m axolotl.cli.preprocess ./config.yml",
        run_folder,
    )


@app.function(
    image=axolotl_image,
    gpu=SINGLE_GPU_CONFIG,
    volumes=VOLUME_CONFIG,
    timeout=24 * HOURS,
)
def merge(run_folder: str, output_dir: str):
    import shutil
    import torch

    output_path = Path(run_folder) / output_dir
    shutil.rmtree(output_path / "merged", ignore_errors=True)

    with open(f"{run_folder}/config.yml"):
        print(f"Merge from {output_path}")

    MERGE_CMD = f"accelerate launch --num_processes {torch.cuda.device_count()} --num_machines 1 --mixed_precision no --dynamo_backend no -m axolotl.cli.merge_lora ./config.yml --lora_model_dir='{output_dir}'"

    run_cmd(MERGE_CMD, run_folder)

    VOLUME_CONFIG["/runs"].commit()


@app.function(image=axolotl_image, timeout=30 * MINUTES, volumes=VOLUME_CONFIG)
def launch(config_raw: str, data_raw: str, run_to_resume: str, preproc_only: bool):
    import yaml
    from huggingface_hub import snapshot_download

    # ensure the base model is downloaded
    config = yaml.safe_load(config_raw)
    model_name = config["base_model"]

    try:
        snapshot_download(model_name, local_files_only=True)
        print(f"Volume contains {model_name}.")
    except FileNotFoundError:
        print(f"Downloading {model_name} ...")
        snapshot_download(model_name)
        print("Committing /pretrained directory (no progress bar) ...")
        VOLUME_CONFIG["/pretrained"].commit()

    # write config and data into a training subfolder
    time_string = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    run_name = (
        f"textreme-{time_string}-{secrets.token_hex(2)}"
        if not run_to_resume
        else run_to_resume
    )
    run_folder = f"/runs/{run_name}"
    os.makedirs(run_folder, exist_ok=True)

    print(f"Preparing training run in {run_folder}.")

    with (
        open(f"{run_folder}/config.yml", "w") as config_file,
        open(f"{run_folder}/{config['datasets'][0]['path']}", "w") as data_file,
    ):
        config_file.write(config_raw)
        data_file.write(data_raw)

    VOLUME_CONFIG["/runs"].commit()

    if preproc_only:
        print("Spawning container for data preprocessing.")
        launch_handle = preproc_data.spawn(run_folder)
    else:
        print("Spawning container for data preprocessing.")
        preproc_handle = preproc_data.spawn(run_folder)
        with open(f"{run_folder}/logs.txt", "w") as f:
            lbl = "preproc"
            f.write(f"{lbl}: https://modal.com/logs/call/{preproc_handle.object_id}")

        # wait for preprocessing to finish
        preproc_handle.get()

        # start training run
        print("Spawning container for training.")
        launch_handle = train.spawn(run_folder, config["output_dir"])

    with open(f"{run_folder}/logs.txt", "w") as f:
        lbl = "train" if not preproc_only else "preproc"
        f.write(f"{lbl}: https://modal.com/logs/call/{launch_handle.object_id}")

    VOLUME_CONFIG["/runs"].commit()

    return run_name, launch_handle


@app.local_entrypoint()
def main(
    data: str,
    preproc_only: bool = False,
    run_to_resume: str = "",
):
    """
    Main entrypoint for training LLaMA 3.1 8B on text message prediction.
    
    Hard-coded configuration:
    - Always uses llama-3.1-8b.yml config
    - WANDB enabled
    - LoRA adapter always merged after training
    
    Args:
        data: Path to training data JSONL file
        preproc_only: If True, only preprocess data without training
        run_to_resume: Optional run name to resume from
    """
    # hard-coded: always use llama config
    config_path = Path(__file__).parent / "llama-3.1-8b.yml"
    
    # read config and data source files and pass their contents to the remote function
    with open(config_path, "r") as cfg, open(data, "r") as dat:
        run_name, launch_handle = launch.remote(
            cfg.read(), dat.read(), run_to_resume, preproc_only
        )

    # write a local reference to the location on the remote volume with the run
    with open(".last_run_name", "w") as f:
        f.write(run_name)

    # wait for the training run to finish
    merge_handle = launch_handle.get()
    
    # hard-coded: always merge lora
    if not preproc_only:
        merge_handle.get()

    print(f"Run complete. Tag: {run_name}")
    print(f"To inspect outputs, run `modal volume ls textreme-runs-vol {run_name}`")
    if not preproc_only:
        print(
            f"To run sample inference, run `modal run --quiet -m ml.training.inference --run-name {run_name}`"
        )


def run_cmd(cmd: str, run_folder: str):
    """run a command inside a folder, with Modal Volume reloading before and commit on success"""
    import subprocess

    # ensure volumes contain latest files
    VOLUME_CONFIG["/pretrained"].reload()
    VOLUME_CONFIG["/runs"].reload()

    # propagate errors from subprocess
    if exit_code := subprocess.call(cmd.split(), cwd=run_folder):
        exit(exit_code)

    # commit writes to volume
    VOLUME_CONFIG["/runs"].commit()

