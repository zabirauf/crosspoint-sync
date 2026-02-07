import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UploadJob, UploadJobStatus } from '@/types/upload';

interface UploadState {
  jobs: UploadJob[];
  addJob: (job: Omit<UploadJob, 'id' | 'status' | 'progress' | 'bytesTransferred' | 'createdAt'>) => void;
  updateJobProgress: (id: string, bytesTransferred: number, totalBytes: number) => void;
  updateJobStatus: (id: string, status: UploadJobStatus, error?: string) => void;
  removeJob: (id: string) => void;
  retryJob: (id: string) => void;
  clearCompleted: () => void;
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

      clearCompleted: () =>
        set((state) => ({
          jobs: state.jobs.filter((j) => j.status !== 'completed'),
        })),

      getPendingJobs: () => get().jobs.filter((j) => j.status === 'pending'),
      getActiveJob: () => get().jobs.find((j) => j.status === 'uploading'),
    }),
    {
      name: 'zync-uploads',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        jobs: state.jobs
          .filter((j) => j.status === 'pending' || j.status === 'failed')
          .map((j) => ({ ...j, status: 'pending' as const, progress: 0, bytesTransferred: 0 })),
      }),
    },
  ),
);
