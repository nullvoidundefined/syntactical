// Drops every cached admin query when nobody is signed in, so a sign-out (from any screen) does not
// leave the previous admin's access list in the shared query client.
import { useEffect } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { useSignedInUserId } from './AuthProvider';

export function AdminCacheReset() {
  const queryClient = useQueryClient();
  const isSignedOut = useSignedInUserId() === null;

  useEffect(() => {
    if (isSignedOut) queryClient.removeQueries({ queryKey: ['admin'] });
  }, [isSignedOut, queryClient]);

  return null;
}
