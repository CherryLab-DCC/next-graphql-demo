import gql from "graphql-tag";
import Link from "next/link";
import React from "react";
import Status from "./Status";

//   Return an array of biosample scientific names from the given array of genetic modifications.
export function GeneticModificationOrganismNames(biosamples: any[]): string[] {
  const geneticModificationOrganisms: string[] = [];
  biosamples.forEach((biosample) => {
    if (
      biosample.applied_modifications &&
      biosample.applied_modifications.length > 0
    ) {
      const appliedModifications = biosample.applied_modifications;
      appliedModifications.forEach((modification) => {
        if (
          modification.introduced_gene &&
          modification.introduced_gene.organism
        ) {
          geneticModificationOrganisms.push(
            modification.introduced_gene.organism.scientific_name
          );
        } else if (
          modification.modified_site_by_target_id &&
          modification.modified_site_by_target_id.organism
        ) {
          geneticModificationOrganisms.push(
            modification.modified_site_by_target_id.organism.scientific_name
          );
        }
      });
    }
  });
  const reducedGeneticModificationOrganisms =
    geneticModificationOrganisms.reduce((previousValue, currentValue) => {
      if (!previousValue.includes(currentValue)) {
        previousValue.push(currentValue);
      }
      return previousValue;
    }, []);
  return reducedGeneticModificationOrganisms;
}

GeneticModificationOrganismNames.fragment = gql`
  fragment GeneticModificationOrganismNamesFragment on Biosample {
    applied_modifications {
      introduced_gene {
        organism {
          scientific_name
        }
      }
      modified_site_by_target_id {
        organism {
          scientific_name
        }
      }
    }
  }
`;

/**
 * Display the given biosample summary string with any of the given organism names italicized.
 */
export const BiosampleSummaryDisplay = ({
  summary,
  organisms,
}: {
  summary: string;
  organisms: string[];
}) => {
  if (organisms.length > 0) {
    // Generate the equivalent shortened organism scientific names.
    const organismsWithShortenedNames = organisms.concat(
      organisms.map((organism) => organism.replace(/^(\S)\S* (\S+)$/, "$1. $2"))
    );

    let cursor = 0;
    let maybeMoreMatches = true;
    const allOrganismsRegex = new RegExp(organismsWithShortenedNames.join("|"));
    const displayedElements = [];
    while (cursor < summary.length && maybeMoreMatches) {
      const remainingString = summary.slice(cursor);
      const matchData = remainingString.match(new RegExp(allOrganismsRegex));
      if (matchData) {
        if (matchData.index > 0) {
          // Add the text before the match.
          const preMatch = remainingString.slice(0, matchData.index);
          displayedElements.push(
            <React.Fragment key={cursor}>{preMatch}</React.Fragment>
          );
          cursor += preMatch.length;
        }

        // Add the italicized organism name.
        displayedElements.push(<i key={cursor}>{matchData[0]}</i>);
        cursor += matchData[0].length;
      } else {
        maybeMoreMatches = false;
      }
    }

    // Add the remaining text after any matches.
    displayedElements.push(
      <React.Fragment key="remaining">{summary.slice(cursor)}</React.Fragment>
    );
    return <>displayedElements</>;
  }

  // No organisms to italicize.
  return <>{summary}</>;
};

/**
 * Generate a CSS class for the <li> of a search result table item.
 * @param {object} item Displayed search result object
 *
 * @return {string} CSS class for this type of object
 */
export const resultItemClass = (item: { _type: string[] }) =>
  `result-item--type-${item._type[0]}`;

const BiosampleListItem = ({ result }: any) => {
  const lifeStage =
    result.life_stage && result.life_stage !== "unknown"
      ? ` ${result.life_stage}`
      : "";
  const ageDisplay =
    result.age_display && result.age_display !== ""
      ? ` ${result.age_display}`
      : "";
  const separator = lifeStage || ageDisplay ? "," : "";
  const treatment: string[] = [];
  if (result.treatments && result.treatments.length > 0) {
    result.treatments.forEach((treat) => {
      if (treat.treatment_type_details) {
        treatment.push(
          `${treat.treatment_term_name} (${treat.treatment_type_details})`
        );
      } else {
        treatment.push(treat.treatment_term_name);
      }
    });
  }
  const organismName = [result.organism.scientific_name];

  // Calculate genetic modification properties for display.
  const rnais: string[] = [];
  const constructs: string[] = [];
  const mutatedGenes: string[] = [];
  if (result.applied_modifications && result.applied_modifications.length > 0) {
    result.applied_modifications.forEach((am) => {
      // Collect RNAi GM methods.
      if (
        am.method === "RNAi" &&
        am.modified_site_by_target_id &&
        am.modified_site_by_target_id.name
      ) {
        rnais.push(am.modified_site_by_target_id.name);
      }

      // Collect construct GM methods.
      if (
        am.purpose === "tagging" &&
        am.modified_site_by_target_id &&
        am.modified_site_by_target_id.name
      ) {
        constructs.push(am.modified_site_by_target_id.name);
      }

      // Collect mutated gene GM methods.
      if (
        (am.category === "deletion" || am.category === "mutagenesis") &&
        am.modified_site_by_target_id &&
        am.modified_site_by_target_id.name
      ) {
        mutatedGenes.push(am.modified_site_by_target_id.name);
      }
    });
  }

  // Build the text of the synchronization string
  let synchText;
  if (result.synchronization) {
    synchText = `${result.synchronization}${
      result.post_synchronization_time ? ` +${ageDisplay}` : ""
    }`;
  }

  return (
    <div className={resultItemClass(result)}>
      <div className="result-item">
        <div className="result-item__data">
          <Link href={result._id}>
            <a className="result-item__link">
              {`${result.biosample_ontology.term_name} (`}
              <em>{result.organism.scientific_name}</em>
              {`${separator}${lifeStage}${ageDisplay})`}
            </a>
          </Link>
          <div className="result-item__data-row">
            <div>
              <span className="result-item__property-title">Type: </span>
              {result.biosample_ontology.classification}
            </div>
            {result.summary ? (
              <div>
                <span className="result-item__property-title">Summary: </span>
                <BiosampleSummaryDisplay
                  summary={result.summary}
                  organisms={organismName.concat(
                    GeneticModificationOrganismNames([result])
                  )}
                />{" "}
              </div>
            ) : null}
            {rnais.length > 0 ? (
              <div>
                <span className="result-item__property-title">
                  RNAi targets:{" "}
                </span>
                {rnais.join(", ")}
              </div>
            ) : null}
            {constructs.length > 0 ? (
              <div>
                <span className="result-item__property-title">
                  Constructs:{" "}
                </span>
                {constructs.join(", ")}
              </div>
            ) : null}
            {treatment.length > 0 ? (
              <div>
                <span className="result-item__property-title">Treatment: </span>
                {treatment.join(", ")}
              </div>
            ) : null}
            {mutatedGenes.length > 0 ? (
              <div>
                <span className="result-item__property-title">
                  Mutated genes:{" "}
                </span>
                {mutatedGenes.join(", ")}
              </div>
            ) : null}
            {result.culture_harvest_date ? (
              <div>
                <span className="result-item__property-title">
                  Culture harvest date:{" "}
                </span>
                {result.culture_harvest_date}
              </div>
            ) : null}
            {result.date_obtained ? (
              <div>
                <span className="result-item__property-title">
                  Date obtained:{" "}
                </span>
                {result.date_obtained}
              </div>
            ) : null}
            {synchText ? (
              <div>
                <span className="result-item__property-title">
                  Synchronization timepoint:{" "}
                </span>
                {synchText}
              </div>
            ) : null}
            <div>
              <span className="result-item__property-title">Source: </span>
              {result.source.title}
            </div>
          </div>
        </div>
        <div className="result-item__meta">
          <div className="result-item__meta-title">Biosample</div>
          <div className="result-item__meta-id">{` ${result.accession}`}</div>
          <Status
            item={result.status}
            badgeSize="small"
            css="result-table__status"
          />
          {/*props.auditIndicators(result.audit, result._id, {
            session: this.context.session,
            sessionProperties: this.context.session_properties,
            search: true,
          })*/}
        </div>
        {/*<PickerActions context={result} />*/}
      </div>
      {/*props.auditDetail(result.audit, result._id, {
        session: this.context.session,
        sessionProperties: this.context.session_properties,
      })*/}
    </div>
  );
};

BiosampleListItem.fragment = gql`
  fragment BiosampleListItemFragment on Biosample {
    _type
    accession
    age_display
    applied_modifications {
      method
      modified_site_by_target_id {
        name
      }
    }
    biosample_ontology {
      classification
      term_name
    }
    culture_harvest_date
    date_obtained
    life_stage
    organism {
      scientific_name
    }
    post_synchronization_time
    source {
      title
    }
    summary
    status
    synchronization
    treatments {
      treatment_type_details
      treatment_term_name
    }
    ...GeneticModificationOrganismNamesFragment
  }
  ${GeneticModificationOrganismNames.fragment}
`;

export default BiosampleListItem;
