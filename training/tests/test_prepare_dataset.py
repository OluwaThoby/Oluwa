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


    def test_unreviewed_draft_is_rejected(self):
        row = {
            "id": "draft-pending",
            "task_group": "draft-review",
            "capability": "planning",
            "messages": [{"role": "assistant", "content": "Draft target."}],
            "provenance": {
                "provider": "AgencyOS", "model": "assistant-generated-draft",
                "access_method": "other_permitted", "terms_reviewed": False,
                "source_reference": "unreviewed curriculum draft"
            },
            "review": {
                "status": "pending", "correctness": None,
                "completeness": None, "safety": None,
                "reviewer": None, "reviewed_at": None
            }
        }
        errors = MODULE.validate(row)
        self.assertIn("terms_reviewed must be true", errors)
        self.assertIn("only approved examples can enter training", errors)



if __name__ == "__main__":
    unittest.main()
