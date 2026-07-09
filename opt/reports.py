from abc import ABC, abstractmethod
import json
from collections import defaultdict
from pathlib import Path
import logging

from schemas.loader import get_opt_input_builder_class
logger = logging.getLogger(__name__)


class ReportContext:
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


class Report(ABC):
    def __init__(self, context: ReportContext):
        self.context = context

    @abstractmethod
    def generate(self):
        pass


class OutputJsonReport(Report):
    def generate(self) -> str:
        output_file = self.context.file_path
        return output_file.read_text()


class AssignmentInputJsonReport(Report):
    def generate(self) -> str:
        version = self.context.version

        InputBuilder = get_opt_input_builder_class(version)
        input_builder_file = self.context.input_builder_file
        input_builder = InputBuilder.model_validate_json(
            input_builder_file.read_text(),
        )
        resource_ids_map = input_builder.generate_resource_ids(input_builder.aircrafts)
        activity_ids_map = input_builder.generate_activity_ids(input_builder.flights)

        output_file = self.context.file_path
        output_dict = json.loads(output_file.read_text())

        chains = output_dict.get('chains', {})
        asmts = defaultdict(list)
        for ac_id, activity_ids in chains.items():
            if 'unassigned' in ac_id:
                ac = 'unassigned'
            else:
                ac = resource_ids_map.get(int(ac_id))
            if not ac:
                logger.error(f"Resource ID {ac_id} not found in input builder.")
                continue
            for activity_id in activity_ids:
                logger.error(f'Processing activity_id: {activity_id}')
                activity = activity_ids_map.get(activity_id)
                if not activity:
                    logger.error(f"Activity ID {activity_id} not found in input builder.")
                    continue
                asmts[ac_id].append(activity)
        assignments = []
        for ac_id, activities in asmts.items():
            if ac_id == 'unassigned':
                ac = 'unassigned'
            else:
                ac = resource_ids_map.get(int(ac_id))
            activities.sort(key=lambda x: x.start)
            assignments.append({
                'resource': json.loads(ac.model_dump_json(indent=4, exclude_none=True)),
                'activities': [json.loads(act.model_dump_json(indent=4, exclude_none=True)) for act in activities],
            })
        print('assignments', assignments)
        return json.dumps(assignments, indent=4)


class AssignmentUserInputReport(Report):
    def generate(self) -> str:
        version = self.context.version

        InputBuilder = get_opt_input_builder_class(version)
        input_builder_file = self.context.input_builder_file
        input_builder = InputBuilder.model_validate_json(
            input_builder_file.read_text(),
        )
        user_input_file = self.context.user_input_file
        user_input_dict = json.loads(user_input_file.read_text())

        resource_ids_map = input_builder.generate_resource_ids(input_builder.aircrafts)
        activity_ids_map = input_builder.generate_activity_ids(input_builder.flights)

        output_file = self.context.file_path
        output_dict = json.loads(output_file.read_text())

        chains = output_dict.get('chains', {})
        asmts = defaultdict(list)



        return user_input_file.read_text()


# The available reports naming convention is:
# {report_name}_{report_format}
AVAILABLE_REPORTS: dict[str, Report] = {
    'output_json': OutputJsonReport,
    'assignment_input_json': AssignmentInputJsonReport,
    'assignment_user_input_json': AssignmentUserInputReport,
}
REPORT_FORMAT_TO_CONTENT_TYPE = {
    'json': 'application/json',
    'csv': 'text/csv',
    'text': 'text/plain',
}
