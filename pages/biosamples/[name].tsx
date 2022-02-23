import type { NextPage } from "next";
import gql from "graphql-tag";
import graphqlServerSideProps from "@/lib/graphqlServerSideProps";

export const getServerSideProps = graphqlServerSideProps(gql`
  query BiosampleQuery($name: String!) {
    item: getByUniqueKey(ns: "accession", name: $name, type: "Biosample") {
      ... on Biosample {
        _id
        _type
        accession
        organism {
          name
        }
      }
    }
  }
`);

const Biosample: NextPage = (props) => {
  return <pre>{JSON.stringify(props, null, 2)}</pre>;
};

export default Biosample;
