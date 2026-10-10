import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useAccountStatus() {
  return useQuery({ ...orpc.account.status.queryOptions(), staleTime: 5 * 60_000 });
}
export function useMemberInvite(memberId: string | null | undefined, enabled = true) {
  return useQuery({ ...orpc.account.memberInvite.queryOptions({ input: { memberId: memberId ?? "" } }), enabled: enabled && !!memberId });
}
export function useAcceptLegal() {
  return useMutation(orpc.account.acceptLegal.mutationOptions());
}
function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: orpc.account.key() });
    void qc.invalidateQueries({ queryKey: orpc.team.key() });
    void qc.invalidateQueries({ queryKey: orpc.stores.key() });
    void qc.invalidateQueries({ queryKey: orpc.studio.key() });
  };
}
export function useInviteMember() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.account.inviteMember.mutationOptions({ onSuccess }));
}
export function useInviteAccess() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.account.inviteAccess.mutationOptions({ onSuccess }));
}
export function useInviteOwner() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.account.inviteOwner.mutationOptions({ onSuccess }));
}
export function useResetLink() {
  return useMutation(orpc.account.resetLink.mutationOptions());
}
