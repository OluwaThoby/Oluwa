import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "prepare_dataset.py"
SPEC = importlib.util.spec_from_file_location("prepare_dataset", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class DatasetPreparationTests(unittest.TestCase):
    def test_three_groups_produce_nonempty_partitions(self):
        result = MODULE.partition_task_groups(["a", "b", "c"], seed=7)
        self.assertEqual(set(result), {"train", "validation", "test"})
        self.assertTrue(all(len(groups) >= 1 for groups in result.values()))
        self.assertEqual(sum(len(groups) for groups in result.values()), 3)

    def test_splits_are_deterministic(self):
        first = MODULE.partition_task_groups([f"group-{i}" for i in range(20)], seed=42)
        second = MODULE.partition_task_groups([f"group-{i}" for i in range(20)], seed=42)
        self.assertEqual(first, second)

    def test_groups_never_leak_between_splits(self):
        result = MODULE.partition_task_groups([f"group-{i}" for i in range(30)], seed=42)
        values = list(result.values())
        self.assertTrue(values[0].isdisjoint(values[1]))
        self.assertTrue(values[0].isdisjoint(values[2]))
        self.assertTrue(values[1].isdisjoint(values[2]))

    def test_too_few_groups_are_rejected(self):
        with self.assertRaises(ValueError):
            MODULE.partition_task_groups(["only-one", "two"], seed=1)

    def test_low_safety_example_is_rejected(self):
        row = {
            "id": "bad-safety",
            "task_group": "test",
            "capability": "reasoning",
            "messages": [{"role": "assistant", "content": "unsafe"}],
            "provenance": {
                "provider": "test", "model": "test", "access_method": "human_authored",
                "terms_reviewed": True
            },
            "review": {
                "status": "approved", "reviewer": "reviewer", "reviewed_at": "now",
                "correctness": 90, "completeness": 90, "safety": 40
            }
        }
        self.assertIn("safety score must be at least 90", MODULE.validate(row))


if __name__ == "__main__":
    unittest.main()
