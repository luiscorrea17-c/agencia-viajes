import { queryOptions } from "@tanstack/react-query";
import { listClientRecords, type ClientActor } from "@/api/clients";

export const clientQuery = (actor: ClientActor) => queryOptions({
  queryKey: ["client-records", actor.id, actor.role],
  queryFn: () => listClientRecords(actor),
  staleTime: 0,
});