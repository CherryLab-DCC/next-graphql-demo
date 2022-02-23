import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLNonNull,
} from "graphql";
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
// @ts-ignore: Object is possibly 'null'.
profiles.Page.properties.parent.type = "string"; // ['string', 'null']

const types = jsonSchemaToGraphQL(profiles, subtypes);

const itemType = types["Item"];
if (!itemType) {
  throw new Error("Expectd an Item");
}

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
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(itemType))),
      args: {
        path: { type: new GraphQLNonNull(GraphQLString) },
      },
      resolve: (_, { path }, { db }) => {
        return db
          .queryJsonPath(path)
          .then((ids) => ids.map((id) => db.getByUUID(id)));
      },
    },
  }),
});

export default new GraphQLSchema({ query });
