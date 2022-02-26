import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLBoolean,
} from "graphql";
import {
  connectionArgs,
  connectionDefinitions,
  connectionFromArray,
  cursorToOffset,
  offsetToCursor,
} from "graphql-relay";
import jsonSchemaToGraphQL, {
  type Source,
  type Context,
} from "./jsonSchemaToGraphQL";

import profiles_json from "../profiles.json";
const {
  ["@type"]: _type,
  _subtypes: subtypes,
  ...profiles
} = profiles_json as any;
profiles.Page.properties.parent.type = "string"; // ['string', 'null']
profiles.Gene.required = profiles.Gene.required.filter(
  (x: string) => x !== "organism"
);

const types = jsonSchemaToGraphQL(profiles, subtypes);

const itemType = types["Item"];
if (!itemType) {
  throw new Error("Expectd an Item");
}

const { connectionType: itemConnection } = connectionDefinitions({
  nodeType: new GraphQLNonNull(itemType),
  resolveNode: ({ node }, _, { db }) => {
    return db.getByUUID(node);
  },
  connectionFields: {
    totalCount: { type: new GraphQLNonNull(GraphQLInt) },
    currentOffset: { type: new GraphQLNonNull(GraphQLInt) },
  },
});

const query = new GraphQLObjectType<Source, Context>({
  name: "Query",
  fields: () => ({
    getByUUID: {
      type: itemType,
      args: {
        uuid: { type: new GraphQLNonNull(GraphQLString) },
      },
      resolve: (_, { uuid }, { db }) => {
        return db.getByUUID(uuid);
      },
    },
    getByUniqueKey: {
      type: itemType,
      args: {
        ns: { type: new GraphQLNonNull(GraphQLString) },
        name: { type: new GraphQLNonNull(GraphQLString) },
        type: { type: GraphQLString },
      },
      resolve: async (
        _,
        {
          ns,
          name,
          type,
        }: { ns: string; name: string; type: string | undefined },
        { db }
      ) => {
        const obj = await (ns === "uuid"
          ? db.getByUUID(name)
          : db.getByUniqueKey(ns, name));
        if (type) {
          const types = obj?.["@type"];
          if (!Array.isArray(types) || !types.includes(type)) {
            return undefined;
          }
        }
        return obj;
      },
    },
    queryJsonPath: {
      type: new GraphQLNonNull(itemConnection), //new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(itemType))),
      args: {
        path: { type: new GraphQLNonNull(GraphQLString) },
        offset: { type: GraphQLInt },
        all: { type: GraphQLBoolean },
        orderBy: { type: GraphQLString },
        ...connectionArgs,
        first: {
          type: GraphQLInt,
          description: "Returns the first n items from the list.",
          defaultValue: 25,
        },
        last: {
          type: GraphQLInt,
          description: "Returns the last n items from the list.",
          defaultValue: 25,
        },
      },
      resolve: async (_, args, { db }) => {
        let { path, offset, all, orderBy, after, before, first, last } = args;
        // Postgres GIN index does not help with sorting so faster to just fetch whole array here.
        const ids = await db.queryJsonPath(path, null, orderBy ?? undefined);
        const totalCount = ids.length;
        let currentOffset = 0;
        if (all) {
          first = null;
          last = null;
        }
        // XXX: Should check precedence of after and before here.
        if (after) {
          last = null;
          currentOffset = cursorToOffset(after) + 1;
        } else if (before) {
          first = null;
          currentOffset = Math.max(
            0,
            cursorToOffset(before) - (last ?? ids.length)
          );
        } else if (typeof offset === "number") {
          if (offset < 0) {
            currentOffset = Math.max(0, ids.length - offset);
          } else if (offset > 0) {
            currentOffset = offset;
            after = offsetToCursor(currentOffset - 1);
          }
        }
        // This risks page tearing when data is updated but meh.
        const { edges, pageInfo } = connectionFromArray(ids, {
          after,
          before,
          first,
          last,
        });
        // https://github.com/graphql/graphql-relay-js/issues/58
        pageInfo.hasPreviousPage = currentOffset > 0;
        pageInfo.hasNextPage = currentOffset + edges.length < ids.length;

        return { totalCount, currentOffset, edges, pageInfo };
      },
    },
  }),
});

export default new GraphQLSchema({ query });
