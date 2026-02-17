import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UploadJob, UploadJobStatus } from '@/types/upload';

interface UploadState {
  jobs: UploadJob[];
  addJob: (job: Omit<UploadJob, 'id' | 'status' | 'progress' | 'bytesTransferred' | 'createdAt'>) => void;
  addProcessingJob: (id: string, fileName: string, jobType: UploadJob['jobType']) => void;
  finalizeProcessingJob: (id: string, details: { fileName: string; fileUri: string; fileSize: number; destinationPath: string }) => void;
  updateJobProgress: (id: string, bytesTransferred: number, totalBytes: number) => void;
  updateJobStatus: (id: string, status: UploadJobStatus, error?: string) => void;
  removeJob: (id: string) => void;
  retryJob: (id: string) => void;
  resolveConflict: (id: string, action: 'overwrite' | 'remove') => void;
  resetConflicts: () => void;

  getPendingJobs: () => UploadJob[];
  getActiveJob: () => UploadJob | undefined;
}

export const useUploadStore = create<UploadState>()(
  persist(
    (set, get) => ({
      jobs: [],

      addJob: (job) =>
        set((state) => ({
          jobs: [
            ...state.jobs,
            {
              ...job,
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              status: 'pending' as const,
              progress: 0,
              bytesTransferred: 0,
              createdAt: Date.now(),
            },
          ],
        })),

      addProcessingJob: (id, fileName, jobType) =>
        set((state) => ({
          jobs: [
            ...state.jobs,
            {
              id,
              fileName,
              fileUri: '',
              fileSize: 0,
              destinationPath: '',
              status: 'processing' as const,
              progress: 0,
              bytesTransferred: 0,
              createdAt: Date.now(),
              jobType,
            },
          ],
        })),

      finalizeProcessingJob: (id, details) =>
        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.id === id
              ? { ...j, ...details, status: 'pending' as const }
              : j,
          ),
        })),

      updateJobProgress: (id, bytesTransferred, totalBytes) =>
        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  bytesTransferred,
                  progress: totalBytes > 0 ? bytesTransferred / totalBytes : 0,
                }
              : j,
          ),
        })),

      updateJobStatus: (id, status, error) =>
        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status,
                  error,
                  completedAt: status === 'completed' ? Date.now() : j.completedAt,
                }
              : j,
          ),
        })),

      removeJob: (id) =>
        set((state) => ({
          jobs: state.jobs.filter((j) => j.id !== id),
        })),

      retryJob: (id) =>
        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.id === id
              ? { ...j, status: 'pending' as const, progress: 0, bytesTransferred: 0, error: undefined }
              : j,
          ),
        })),

      resolveConflict: (id, action) => {
        if (action === 'remove') {
          set((state) => ({ jobs: state.jobs.filter((j) => j.id !== id) }));
        } else {
          set((state) => ({
            jobs: state.jobs.map((j) =>
              j.id === id
                ? { ...j, status: 'pending' as const, progress: 0, bytesTransferred: 0, error: undefined, forceUpload: true }
                : j,
            ),
          }));
        }
      },

      resetConflicts: () =>
        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.status === 'conflict'
              ? { ...j, status: 'pending' as const, progress: 0, bytesTransferred: 0, error: undefined, forceUpload: false }
              : j,
          ),
        })),


      getPendingJobs: () => get().jobs.filter((j) => j.status === 'pending'),
      getActiveJob: () => get().jobs.find((j) => j.status === 'uploading'),
    }),
    {
      name: 'crosspointsync-uploads',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        jobs: state.jobs
          .filter((j) => j.status === 'pending' || j.status === 'failed' || j.status === 'conflict')
          .map((j) => ({ ...j, status: 'pending' as const, progress: 0, bytesTransferred: 0, forceUpload: false })),
      }),
    },
  ),
);
