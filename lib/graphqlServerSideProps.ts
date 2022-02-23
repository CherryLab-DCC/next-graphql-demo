import type { GetServerSideProps, GetServerSidePropsContext } from "next";
import { withDB } from "./DB";
import schema from "./graphqlSchema";
import { validate, execute, type DocumentNode } from "graphql";

export default function graphqlServerSideProps(
  document: DocumentNode,
  getVariableValues: (context: GetServerSidePropsContext) => {
    readonly [variable: string]: unknown;
  } = (context) => context.query
): GetServerSideProps {
  const validationErrors = validate(schema, document);
  if (validationErrors.length > 0) {
    throw new AggregateError(validationErrors);
  }
  return withDB(async (db, context) => {
    const contextValue = { db };
    const variableValues = getVariableValues(context);
    const props = await execute({
      schema,
      document,
      contextValue,
      variableValues,
    });
    return { props };
  });
}
