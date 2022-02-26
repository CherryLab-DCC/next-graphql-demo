# next-graphql-demo

An experiment for running a GraphQL server within Next.js.

The GraphQL schema is generated from the encodeD JSON Schemas.

## Notes

* Reverse references are modeled as Relay Connections while -to many forward references are modeled as GraphQL lists.
  Would it make more sense to make this distinction on the expected size of the referenced list?

* Superclasses should be modeled as interfaces rather than unions.
  Nit: naming conflicts for superclasses which are also concrete classes.

* Postgres' GIN index does not help with sorting.
  Querying a 1M resultset (all files) takes around 5 seconds.
  SQL pagination in database approximately doubles that.
  Filtering in DB with jsonpath may be the best option since it seems fast and avoids transferring 40MB from the database:

  ```sql
  select jsonb_path_query_array(jsonb_agg(id), '$[0 to 100]') from items where object @@ '$.__typename == "File"'; 
  ```

* How should non-visible forward references be handled?
  Maybe just assume nullable even if required? But then how to get url of that page?

# Running Docker

```
docker build . -t next-graphql-demo
docker run -p 3000:3000 -e "PGHOST=host.docker.internal" -e "PGDATABASE=$USER" -e "PGUSER=$USER" -it next-graphql-demo
```
