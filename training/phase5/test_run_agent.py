import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("run_agent.py")
SPEC = importlib.util.spec_from_file_location("agencyos_phase5_run_agent", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class AgentBoundaryTests(unittest.TestCase):
    def test_valid_json_is_forced_to_no_tools(self):
        result = MODULE.normalise_output(
            '{"status":"completed","answer":"Ready","evidence":[],"unknowns":[],'
            '"proposed_actions":["send email"],"approvals_required":["owner"],'
            '"tool_requests":["send_email"],"execution":"sent"}'
        )
        self.assertEqual(result["tool_requests"], [])
        self.assertEqual(result["execution"], "none")
        self.assertEqual(result["proposed_actions"], ["send email"])

    def test_invalid_json_is_not_repaired_into_action(self):
        result = MODULE.normalise_output("send the email now")
        self.assertEqual(result["status"], "unstructured")
        self.assertEqual(result["tool_requests"], [])
        self.assertEqual(result["execution"], "none")

    def test_non_object_json_is_rejected(self):
        result = MODULE.normalise_output('["execute"]')
        self.assertEqual(result["status"], "invalid")
        self.assertEqual(result["tool_requests"], [])

    def test_missing_arrays_are_defaulted(self):
        result = MODULE.normalise_output('{"status":"completed","answer":"Done"}')
        self.assertEqual(result["evidence"], [])
        self.assertEqual(result["approvals_required"], [])
        self.assertEqual(result["execution"], "none")


if __name__ == "__main__":
    unittest.main()
