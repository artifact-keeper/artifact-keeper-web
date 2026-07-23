import '@/lib/sdk-client';
import {
  listPypiTracks,
  putPypiTrack,
  deletePypiTrack,
} from '@artifact-keeper/sdk';
import type { PypiTrackResponse, PypiTracksListResponse } from '@artifact-keeper/sdk';
import { assertData } from '@/lib/api/fetch';

/**
 * A PEP 708 `tracks` declaration on a PyPI virtual repository.
 *
 * By default a PyPI virtual isolates a locally-owned project name from the
 * same name upstream (dependency-confusion mitigation, artifact-keeper#1600).
 * Declaring a `tracks` relationship re-unions the local project's versions
 * with the named upstream Simple index for that project.
 */
export interface PypiTrack {
  /** PEP 503 normalized project name. */
  normalized_name: string;
  repository_key: string;
  /** Upstream Simple index URL this local project tracks. */
  tracks_url: string;
}

function adaptPypiTrack(sdk: PypiTrackResponse): PypiTrack {
  return {
    normalized_name: sdk.normalized_name,
    repository_key: sdk.repository_key,
    tracks_url: sdk.tracks_url,
  };
}

function adaptPypiTracksList(sdk: PypiTracksListResponse): PypiTrack[] {
  return sdk.items.map(adaptPypiTrack);
}

const pypiTracksApi = {
  /** List every `tracks` declaration on a repository. */
  list: async (key: string): Promise<PypiTrack[]> => {
    const { data, error } = await listPypiTracks({ path: { key } });
    if (error) throw error;
    return adaptPypiTracksList(assertData(data, 'pypiTracksApi.list'));
  },

  /** Declare (upsert) that `project` tracks `tracksUrl`. */
  upsert: async (key: string, project: string, tracksUrl: string): Promise<PypiTrack> => {
    const { data, error } = await putPypiTrack({
      path: { key, project },
      body: { tracks_url: tracksUrl },
    });
    if (error) throw error;
    return adaptPypiTrack(assertData(data, 'pypiTracksApi.upsert'));
  },

  /** Remove a `tracks` declaration, restoring default isolation for `project`. */
  remove: async (key: string, project: string): Promise<void> => {
    const { error } = await deletePypiTrack({ path: { key, project } });
    if (error) throw error;
  },
};

export default pypiTracksApi;
