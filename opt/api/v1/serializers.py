from django.urls import reverse
from rest_framework import serializers
from django.conf import settings

from opt.models import OptimizationScenario, OutputFile


class OutputFileSerializer(serializers.ModelSerializer):
    output_file_url = serializers.SerializerMethodField()
    class Meta:
        model = OutputFile
        fields = ['id', 'run', 'file', 'uploaded_at', 'output_file_url']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if settings.STORAGE == 's3':
            self.fields['presigned_url'] = serializers.SerializerMethodField()

    def get_presigned_url(self, obj):
        return obj.get_presigned_url

    def get_output_file_url(self, obj):
        request = self.context.get('request')
        if request is None:
            return None  # Or return just obj.file.url if you want relative URL
        url = reverse('opt:output-file', kwargs={'output_file_id': obj.id})
        return url


class OptimizationScenarioSerializer(serializers.ModelSerializer):
    output_files = OutputFileSerializer(many=True, read_only=True)
    input_builder_url = serializers.SerializerMethodField()
    run_summary = serializers.JSONField(required=False)

    class Meta:
        model = OptimizationScenario
        fields = [
            'id',
            'user',
            'name',
            'created_at',
            'status',
            'input_builder',
            'run_directory',
            'run_summary',
            'output_files',
            'input_builder_url',
        ]

    def get_run_summary(self, obj):
        request = self.context.get('request')
        if request is None:
            return None
        url = reverse('opt:run-summary', kwargs={'run_id': obj.id})
        return request.build_absolute_uri(url)

    def get_input_builder_url(self, obj):
        request = self.context.get('request')
        if request is None:
            return None  # Or return just reverse(...) if you want relative URL

        url = reverse('opt:input-builder', kwargs={'run_id': obj.id})
        return request.build_absolute_uri(url)

