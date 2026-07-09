from rest_framework import serializers

from params.models import ParameterSet


class ParameterSetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParameterSet
        fields = [
            'id',
            'name',
            'description',
            'created_at',
            'organization',
            'params',
        ]
        read_only_fields = ['id', 'created_at']

    def create(self, validated_data):
        user = self.context['request'].user
        if not user.is_superuser:
            # enforce organization from profile for normal users
            validated_data['organization'] = user.profile.organization
        return super().create(validated_data)
