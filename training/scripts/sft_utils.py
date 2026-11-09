"""Small dependency-free helpers for supervised fine-tuning."""


def labels_for_assistant_completion(input_ids: list[int], prompt_length: int) -> list[int]:
    """Mask prompt tokens so loss is computed only on the assistant completion."""
    if prompt_length < 0 or prompt_length > len(input_ids):
        raise ValueError("prompt_length must be within the input token sequence")
    if prompt_length == len(input_ids):
        raise ValueError("example has no assistant completion tokens")
    return [-100] * prompt_length + input_ids[prompt_length:]
