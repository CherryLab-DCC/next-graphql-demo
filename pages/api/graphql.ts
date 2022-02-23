import { withDB } from "@/lib/DB";
import schema from "@/lib/graphqlSchema";
import {
  getGraphQLParameters,
  processRequest,
  renderGraphiQL,
  sendResult,
  shouldRenderGraphiQL,
} from "graphql-helix";
import { type NextApiHandler } from "next";

const handler: NextApiHandler = withDB(async (db, req, res) => {
  const { body, headers, method = "GET", query } = req;
  const request = { body, headers, method, query };
  const contextFactory = () => ({ db });
  if (shouldRenderGraphiQL(request)) {
    res.send(renderGraphiQL({ endpoint: "/api/graphql" }));
  } else {
    const { operationName, query, variables } = getGraphQLParameters(request);
    const result = await processRequest({
      contextFactory,
      operationName,
      query,
      variables,
      request,
      schema,
    });
    sendResult(result, res);
  }
});

export default handler;
