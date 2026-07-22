import logging

from schemas.optinput.base import InputBuilder
from schemas.optoutput.base import OptOutputFile, OutputFile
from schemas.loader import get_output_file_class


logger = logging.getLogger(__name__)


def generate_output_file(
    builder: InputBuilder,
    output_file: OptOutputFile,
) -> OutputFile:
    resource_map = builder.generate_resource_ids(builder.aircrafts)
    flights_map = builder.generate_activity_ids(builder.flights)
    logger.debug(f"resource_map: {resource_map}")
    logger.debug(f"flights_map: {flights_map}")
    new_assignments = []
    for resource_id, activity_ids in output_file.assignments.items():
        logger.debug(f"resource_id: {resource_id} ({type(resource_id)})")
        logger.debug(f"activity_ids: {activity_ids} ({type(activity_ids)})")
        if resource_id == 'unassigned':
            if len(activity_ids) == 0:
                continue
            resource = 'unassigned'
        else:
            resource_id = int(resource_id)
            resource = resource_map.get(resource_id)
            assert resource is not None, f"Resource ID {resource_id} not found in input builder"
        dict_ = {
            'resource': resource,
            'activities': []
        }
        new_assignments.append(dict_)
        for activity_id in activity_ids:
            activity = flights_map.get(activity_id)
            assert activity is not None, f"Activity ID {activity_id} not found in input builder"
            dict_['activities'].append(activity)
    version = output_file.version
    logger.debug(f"new_assignments: {new_assignments}")
    output_file_cls = get_output_file_class(version)
    return output_file_cls(
        version=version,
        kpis=output_file.kpis,
        assignments=new_assignments
    )
