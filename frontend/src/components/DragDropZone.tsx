import { useState, useCallback } from 'react'
import { Upload, File, Image, Film, Music, FileText, X } from 'lucide-react'
import { uploadApi } from '../services/api'

interface DroppedFile {
  file: File
  progress: number
  uploaded: boolean
  attachmentId?: number
  error?: string
}

export function DragDropZone({ children, onFilesUploaded }: { children: React.ReactNode, onFilesUploaded: (attachmentIds: number[]) => void }) {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState<DroppedFile[]>([])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); if (e.currentTarget === e.target) setIsDragging(false) }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length === 0) return
    const newFiles: DroppedFile[] = dropped.map(file => ({ file, progress: 0, uploaded: false }))
    setFiles(prev => [...prev, ...newFiles])
    uploadFiles(newFiles)
  }, [])

  const uploadFiles = async (toUpload: DroppedFile[]) => {
    const ids: number[] = []
    for (const item of toUpload) {
      try {
        const res = await uploadApi.upload(item.file, (p) => {
          setFiles(prev => prev.map(f => f.file === item.file ? { ...f, progress: p } : f))
        })
        if (res.success) {
          setFiles(prev => prev.map(f => f.file === item.file ? { ...f, uploaded: true, attachmentId: res.data.id } : f))
          ids.push(res.data.id)
        }
      } catch (err: any) {
        setFiles(prev => prev.map(f => f.file === item.file ? { ...f, error: err.message || 'Upload failed' } : f))
      }
    }
    if (ids.length > 0) onFilesUploaded(ids)
    setTimeout(() => setFiles(prev => prev.filter(f => f.uploaded || f.error)), 2000)
  }

  const removeFile = (file: File) => setFiles(prev => prev.filter(f => f.file !== file))
  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="w-4 h-4 text-blue-500" />
    if (type.startsWith('video/')) return <Film className="w-4 h-4 text-purple-500" />
    if (type.startsWith('audio/')) return <Music className="w-4 h-4 text-green-500" />
    if (type.includes('pdf')) return <FileText className="w-4 h-4 text-red-500" />
    return <File className="w-4 h-4 text-muted-foreground" />
  }

  return (
    <div className="relative flex-1 min-h-0" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {children}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-2xl flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-medium text-primary">Drop files here</p>
            <p className="text-sm text-muted-foreground">Release to upload</p>
          </div>
        </div>
      )}
      {files.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 z-40 bg-card border-t p-3 space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {getFileIcon(f.file.type)}
              <span className="flex-1 truncate">{f.file.name}</span>
              {f.error ? <span className="text-destructive">{f.error}</span> : f.uploaded ? <span className="text-green-500">✓</span> : <span className="text-muted-foreground">{f.progress}%</span>}
              <button onClick={() => removeFile(f.file)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
