import { useSyncExternalStore } from 'react';
import {
  getActiveDatasource,
  listDatasources,
  subscribe,
  type StoredDatasource,
} from './datasources';

export function useDatasourceList(): StoredDatasource[] {
  return useSyncExternalStore(subscribe, listDatasources, emptyList);
}

export function useActiveDatasource(): StoredDatasource | null {
  return useSyncExternalStore(subscribe, getActiveDatasource, getNull);
}

const _empty: StoredDatasource[] = [];
function emptyList() {
  return _empty;
}
function getNull(): StoredDatasource | null {
  return null;
}
