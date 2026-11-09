import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from sft_utils import labels_for_assistant_completion


class SupervisedFineTuningTests(unittest.TestCase):
    def test_masks_prompt_and_keeps_assistant_completion(self):
        self.assertEqual(labels_for_assistant_completion([10, 11, 12, 13, 14], 3), [-100, -100, -100, 13, 14])

    def test_rejects_prompt_longer_than_sequence(self):
        with self.assertRaises(ValueError):
            labels_for_assistant_completion([1, 2], 3)

    def test_rejects_empty_completion(self):
        with self.assertRaises(ValueError):
            labels_for_assistant_completion([1, 2], 2)


if __name__ == "__main__":
    unittest.main()
