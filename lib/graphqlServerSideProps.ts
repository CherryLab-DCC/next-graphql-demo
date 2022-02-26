import type { GetServerSideProps, GetServerSidePropsContext } from "next";
import { withDB } from "./DB";
import schema from "./graphqlSchema";
import { Kind, OperationTypeNode } from "graphql/language";
import { validate, execute, type DocumentNode, OperationDefinitionNode, VariableDefinitionNode } from "graphql";
import { ParsedUrlQuery } from "querystring";

function maybeAggregateError(errors: Readonly<Error[]>): Error {
  if (errors.length === 1) {
    return errors[0]!;
  }
  return new AggregateError(
    errors,
    ["", ...errors.map((err) => `- ${err.name}: ${err.message}`)].join("\n")
  );
}

function typedQuery(query: ParsedUrlQuery, variableDefinitions: Readonly<VariableDefinitionNode[]>) {
const result: { [variable: string]: unknown; } = {};
for (const { variable, type } of variableDefinitions) {
  const variableName = variable.name.value;
  let rawValue = query[variableName];
  if (rawValue === undefined) {
    continue;
  }
  let node = type;
  while (node.kind === Kind.NON_NULL_TYPE) {
    node = node.type;
  }
  let isList = false;
  if (node.kind === Kind.LIST_TYPE) {
    isList = true;
    node = node.type;
    while (node.kind === Kind.NON_NULL_TYPE) {
      node = node.type;
    }
  }
  if (node.kind !== Kind.NAMED_TYPE) {
    continue;
  }
  const typeName = node.name.value;
  if (Array.isArray(rawValue)) {
    if (!isList) {
      continue;
    }
  } else {
    rawValue = [rawValue];
  }
  const parsed = rawValue.map(s => {
    switch (typeName) {
      case "String":
        return s;
      default: {
        try {
          return JSON.parse(s);
        } catch {
          return s;
        }
      }
    }
  })
  result[variableName] = isList ? parsed : parsed[0];
}
return result;
}

export default function graphqlServerSideProps(
  document: DocumentNode,
  getVariableValues: (context: GetServerSidePropsContext, variableDefinitions: Readonly<VariableDefinitionNode[]>) => {
    readonly [variable: string]: unknown;
  } = ({ query }, variableDefinitions) => typedQuery(query, variableDefinitions)
): GetServerSideProps {
  const validationErrors = validate(schema, document);
  if (validationErrors.length > 0) {
    throw maybeAggregateError(validationErrors);
  }

  const query = document.definitions.find(def => def.kind === Kind.OPERATION_DEFINITION && def.operation === OperationTypeNode.QUERY) as OperationDefinitionNode | undefined;
  const variableDefinitions = query?.variableDefinitions ?? [];

  return withDB(async (db, context) => {
    const contextValue = { db };
    const variableValues = getVariableValues(context, variableDefinitions);
    const props = await execute({
      schema,
      document,
      contextValue,
      variableValues,
    });
    if (props.errors) {
      throw maybeAggregateError(props.errors);
    }
    return { props };
  });
}
