/** A temporal XML model with changed tuples, unchanged tuples in the same relation, bounded context, and isolated atoms. */
export function focusXml(staticTrace = false): string {
  const instance = (index: number) => `<instance command="Run focused" filename="focus.als" bitwidth="4" tracelength="${staticTrace ? 1 : 3}" looplength="${staticTrace ? 1 : 2}">
    <sig ID="u" label="univ" builtin="yes"/>
    <sig ID="node" label="domain/Node" parentID="u">${['A0', 'A1', 'B0', 'B1', 'C0', 'C1', 'H0', 'R0', 'Quiet0', 'Quiet1', 'D0', 'D1'].map((atom) => `<atom label="${atom}"/>`).join('')}</sig>
    <sig ID="born" label="domain/Born" parentID="u" var="yes">${index ? '<atom label="Born0"/>' : ''}</sig>
    <sig ID="gone" label="domain/Gone" parentID="u" var="yes">${index ? '' : '<atom label="Gone0"/>'}</sig>
    <sig ID="toggle" label="domain/Toggled" var="yes">${index ? '<atom label="A1"/>' : ''}<type ID="node"/></sig>
    <field ID="active" label="active" parentID="node" var="yes"><tuple><atom label="A0"/><atom label="${index === 1 ? 'B1' : 'B0'}"/></tuple><tuple><atom label="Quiet0"/><atom label="Quiet1"/></tuple><types><type ID="node"/><type ID="node"/></types></field>
    <field ID="context" label="context" parentID="node">${[['A0', 'C0'], ['C0', 'C1'], ['C0', 'H0'], ['D0', 'D1']].map((tuple) => `<tuple>${tuple.map((atom) => `<atom label="${atom}"/>`).join('')}</tuple>`).join('')}<types><type ID="node"/><type ID="node"/></types></field>
    <field ID="nary" label="nary" parentID="node"><tuple><atom label="A0"/><atom label="H0"/><atom label="R0"/></tuple><types><type ID="node"/><type ID="node"/><type ID="node"/></types></field>
  </instance>`;
  return `<alloy>${Array.from({ length: staticTrace ? 1 : 3 }, (_, i) => instance(i)).join('')}</alloy>`;
}
