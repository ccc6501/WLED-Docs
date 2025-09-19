'use client';

import { useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';

interface UploadDropzoneProps {
  onUploadComplete: (files: Array<{ name: string; size: number }>) => void;
}

export function UploadDropzone({ onUploadComplete }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFiles(files: FileList) {
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append('files', file));
    setIsUploading(true);
    try {
      const response = await fetch('/api/rag/upload', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      const data = await response.json();
      onUploadComplete(data.files ?? []);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border/80 bg-black/30 p-8 text-center transition ${
        isDragging ? 'border-accent bg-accent/10' : ''
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (event.dataTransfer.files?.length) {
          void handleFiles(event.dataTransfer.files);
        }
      }}
    >
      <input
        type="file"
        multiple
        className="hidden"
        onChange={(event) => event.target.files && void handleFiles(event.target.files)}
        accept=".pdf,.csv,.txt,.xlsx,.xls"
      />
      {isUploading ? <Loader2 className="h-10 w-10 animate-spin text-accent" /> : <UploadCloud className="h-10 w-10 text-accent" />}
      <p className="text-sm text-muted-foreground">
        Drop your ops docs here (PDF, CSV, XLSX). Files stay local. Optimized for Chrome drag & drop.
      </p>
    </label>
  );
}
