import '@/lib/sdk-client';
import {
  listRepoLabels,
  addRepoLabel,
  deleteRepoLabel,
} from '@artifact-keeper/sdk';
import type { LabelResponse, LabelsListResponse } from '@artifact-keeper/sdk';
import { assertData } from '@/lib/api/fetch';

/** A key/value label on a repository. */
export interface RepoLabel {
  id: string;
  key: string;
  value: string;
  created_at: string;
}

function adapt(sdk: LabelResponse): RepoLabel {
  return { id: sdk.id, key: sdk.key, value: sdk.value, created_at: sdk.created_at };
}

const repoLabelsApi = {
  list: async (repoKey: string): Promise<RepoLabel[]> => {
    const { data, error } = await listRepoLabels({ path: { key: repoKey } });
    if (error) throw error;
    return (assertData(data, 'repoLabelsApi.list') as LabelsListResponse).items.map(adapt);
  },

  /** Add or update a single label (`label_key` = the label's key). */
  add: async (repoKey: string, labelKey: string, value: string): Promise<RepoLabel> => {
    const { data, error } = await addRepoLabel({
      path: { key: repoKey, label_key: labelKey },
      body: { value },
    });
    if (error) throw error;
    return adapt(assertData(data, 'repoLabelsApi.add'));
  },

  remove: async (repoKey: string, labelKey: string): Promise<void> => {
    const { error } = await deleteRepoLabel({ path: { key: repoKey, label_key: labelKey } });
    if (error) throw error;
  },
};

export default repoLabelsApi;
