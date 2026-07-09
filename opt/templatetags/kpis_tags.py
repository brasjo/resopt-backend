from django import template


register = template.Library()


@register.inclusion_tag("opt/kpis_table.html")
def render_kpis_table(kpis_rows, output_file_names):
    """
    Renders a KPI table with the given rows and output file names.
    """
    return {
        "kpis_rows": kpis_rows,
        "output_file_names": output_file_names,
    }


@register.filter
def visible_non_checkbox(fields):
    return [
        f for f in fields
        if f.name != "DELETE" and getattr(f.field.widget, "input_type", None) != "checkbox"
    ]


@register.filter
def index(sequence, i):
    return sequence[i]

