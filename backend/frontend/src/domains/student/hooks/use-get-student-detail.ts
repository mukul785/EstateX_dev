import { studentFormInitialState } from '../reducer/student-form-reducer';
import { GetStudentDetailProps } from '../types';
import { useGetStudentDetailQuery } from '../api/student-api';

const initialState: GetStudentDetailProps = { ...studentFormInitialState, id: 0, reporterName: '' };
export const useGetStudentDetail = (id: string | undefined) => {
  // reads the RTK cache, so it follows refetches after update/status mutations
  const { data } = useGetStudentDetailQuery(id, { refetchOnMountOrArgChange: true });
  return data ?? initialState;
};
