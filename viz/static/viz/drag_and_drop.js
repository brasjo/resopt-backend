const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('fileElem');
const fileList = document.getElementById('file-list');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
    dropArea.addEventListener(event, e => {
        e.preventDefault();
        e.stopPropagation();
    });
});

dropArea.addEventListener('drop', e => {
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', async () => {
    await handleFiles(fileInput.files);
});

async function handleFiles(files) {
    for (const file of files) {
        await uploadFile(file);
    }
}

async function uploadFile(file) {
    if (file.size > window.DJANGO.maxUploadSize) {
        alert(`File size exceeds the maximum limit of ${window.DJANGO.maxUploadSize / 1024 / 1024} MB.`);
        return;
    }

    const li = document.createElement('li');
    li.textContent = file.name;

    const progress = document.createElement('progress');
    progress.value = 0;
    progress.max = 100;

    li.appendChild(progress);
    fileList.appendChild(li);

    const formData = new FormData();
    formData.append('file', file);

    if (selectedOptRunId) {
        console.log('selectedOptRunId:', selectedOptRunId);
        formData.append('selectedOptRunId', selectedOptRunId);
    }

    try {
        const response = await fetch(`${window.DJANGO.uploadUrl}?run_id=${selectedOptRunId}`, {
            method: 'POST',
            headers: {
                'X-CSRFToken': csrftoken
            },
            body: formData
        });

        if (response.ok) {
            li.textContent += ' ✔';
        } else {
            const text = await response.text();
            li.textContent += ' ✖';
            alert(`Error uploading file: ${text}`);
        }
    } catch (error) {
        console.error('Upload failed:', error);
        li.textContent += ' ✖';
        alert(`Upload error: ${error.message}`);
    }
}
