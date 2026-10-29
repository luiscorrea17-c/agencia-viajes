import { queryOptions } from "@tanstack/react-query";
import { listClients, listRequests, type RequestActor } from "@/api";

export const requestQuery = (actor: RequestActor) => queryOptions({
  queryKey: ["requests", actor.id, actor.role],
  queryFn: async () => {
    const [requests, clients] = await Promise.all([listRequests(actor), listClients(actor)]);
    return { requests, clients };
  },
  staleTime: 0,
});