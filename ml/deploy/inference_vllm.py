import time
from pathlib import Path
import modal

from fastapi.responses import StreamingResponse

from .common_vllm import app, vllm_image, Colors, MINUTES, VOLUME_CONFIG

# hardcoded to use one H100 for inference
INFERENCE_GPU_CONFIG = "h100:1"
N_INFERENCE_GPUS = 1

with vllm_image.imports():
    from vllm.engine.arg_utils import AsyncEngineArgs
    from vllm.engine.async_llm_engine import AsyncLLMEngine
    from vllm.sampling_params import SamplingParams
    from vllm.utils import random_uuid
    import yaml


def get_model_path_from_run(path: Path) -> Path:
    with (path / "config.yml").open() as f:
        return path / yaml.safe_load(f.read())["output_dir"] / "merged"


@app.cls(
    gpu=INFERENCE_GPU_CONFIG,
    image=vllm_image,
    volumes=VOLUME_CONFIG,
    max_containers=4,
    buffer_containers=1,
    scaledown_window=15 * MINUTES,
)
@modal.concurrent(max_inputs=30)
class Inference:
    run_name: str = modal.parameter()
    run_dir: str = modal.parameter(default="/runs")

    @modal.enter()
    def init(self):
        from transformers import AutoTokenizer
        
        if self.run_name:
            path = Path(self.run_dir) / self.run_name
            VOLUME_CONFIG[self.run_dir].reload()
            model_path = get_model_path_from_run(path)
        else:
            # pick the last run automatically
            run_paths = list(Path(self.run_dir).iterdir())
            for path in sorted(run_paths, reverse=True):
                model_path = get_model_path_from_run(path)
                if model_path.exists():
                    break

        print(
            Colors.GREEN,
            Colors.BOLD,
            f"🧠: Initializing vLLM engine for model at {model_path}",
            Colors.END,
            sep="",
        )

        # load tokenizer for chat template
        self.tokenizer = AutoTokenizer.from_pretrained(str(model_path))

        engine_args = AsyncEngineArgs(
            model=model_path,
            gpu_memory_utilization=0.95,
            tensor_parallel_size=N_INFERENCE_GPUS,
            disable_custom_all_reduce=True,  # brittle as of v0.5.0
        )
        self.engine = AsyncLLMEngine.from_engine_args(engine_args)

    def format_prompt(self, input: str, sender: str = "ME", partial_response: str = "") -> str:
        """
        Apply Llama 3 chat template matching training format
        
        Args:
            input: The conversation context/prompt
            sender: The name of the sender being predicted
            partial_response: Optional partial response to complete (model will continue from here)
        """
        system_prompt = f"Write a realistic text message response from {sender} of one message or more. Avoid repetition."
        
        # manually construct Llama 3 chat format (matches training template)
        formatted = (
            f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
            f"{system_prompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n"
            f"{input}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
            f"{partial_response}"
        )
        
        return formatted

    async def _stream(self, input: str, temperature: float = 0.2, sender: str = "ME", partial_response: str = ""):
        if not input:
            return

        # format with chat template
        formatted_input = self.format_prompt(input, sender, partial_response)

        sampling_params = SamplingParams(
            repetition_penalty=1.1,
            temperature=temperature,
            top_p=0.95,
            top_k=50,
            max_tokens=1024,
        )

        request_id = random_uuid()
        results_generator = self.engine.generate(formatted_input, sampling_params, request_id)

        t0 = time.time()
        index, tokens = 0, 0

        async for request_output in results_generator:
            if (
                request_output.outputs[0].text
                and "\ufffd" == request_output.outputs[0].text[-1]
            ):
                continue

            yield request_output.outputs[0].text[index:]
            index = len(request_output.outputs[0].text)

            # token accounting
            new_tokens = len(request_output.outputs[0].token_ids)
            tokens = new_tokens

        throughput = tokens / (time.time() - t0)
        print(
            Colors.GREEN,
            Colors.BOLD,
            f"🧠: Effective throughput of {throughput:.2f} tok/s",
            Colors.END,
            sep="",
        )

    @modal.method()
    async def completion(self, input: str, temperature: float = 0.2, sender: str = "ME", partial_response: str = ""):
        async for text in self._stream(input, temperature, sender, partial_response):
            yield text

    @modal.method()
    async def non_streaming(self, input: str, temperature: float = 0.2, sender: str = "ME", partial_response: str = ""):
        output = [text async for text in self._stream(input, temperature, sender, partial_response)]
        return "".join(output)

    @modal.web_endpoint()
    async def web(self, input: str, temperature: float = 0.2, sender: str = "ME", partial_response: str = ""):
        return StreamingResponse(self._stream(input, temperature, sender, partial_response), media_type="text/event-stream")

    @modal.exit()
    def stop_engine(self):
        if N_INFERENCE_GPUS > 1:
            import ray

            ray.shutdown()

        # access private attribute to ensure graceful termination
        self.engine._background_loop_unshielded.cancel()


@app.local_entrypoint()
def inference_main(run_name: str = "", prompt: str = "", sender: str = "ME"):
    if not prompt:
        prompt = input(
            "Enter a prompt (conversation context):\n"
        )

    print(
        Colors.GREEN, Colors.BOLD, f"🧠: Querying model {run_name} (predicting {sender})", Colors.END, sep=""
    )

    response = ""
    for chunk in Inference(run_name=run_name).completion.remote_gen(prompt, sender=sender):
        response += chunk  # not streaming to avoid mixing with server logs

    print(Colors.BLUE, f"👤: {prompt}", Colors.END, sep="")
    print(Colors.GRAY, f"🤖: {response}", Colors.END, sep="")

