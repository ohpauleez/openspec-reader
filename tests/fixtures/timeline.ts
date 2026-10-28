/** A captured protocol trace with atomic multi-effect steps, n-ary updates, state fields, recorded action values and a lasso. */
export function timelineXml(options: { static?: boolean; selfLoop?: boolean; rename?: boolean } = {}): string {
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const tuple = (...atoms: string[]) => `<tuple>${atoms.map((a) => `<atom label="${escape(a)}"/>`).join('')}</tuple>`;
  const field = (id: string, label: string, owner: string, types: string[], tuples: string, mutable = true) => `<field ID="${id}" label="${label}" parentID="${owner}"${mutable ? ' var="yes"' : ''}>${tuples}<types>${types.map((id) => `<type ID="${id}"/>`).join('')}</types></field>`;
  const instance = (index: number) => {
    const phases = index === 0 ? ['"Idle"', '"Idle"'] : index === 1 ? ['"Busy"', '"Idle"'] : index === 2 ? ['"Busy"', '"Busy"'] : ['"Idle"', '"Busy"'];
    const temporal = options.static ? '' : ` tracelength="${options.selfLoop ? 1 : 4}" looplength="${options.selfLoop ? 1 : 3}"`;
    return `<instance command="Run protocol" filename="protocol.als" bitwidth="4"${temporal}>
      <sig ID="u" label="univ" builtin="yes"/>
      <sig ID="i" label="Int" parentID="u" builtin="yes"/>
      <sig ID="s" label="String" parentID="u" builtin="yes">${['"Idle"', '"Busy"', '"Acquire"', '"Release"'].map((a) => `<atom label="${escape(a)}"/>`).join('')}</sig>
      <sig ID="actor" label="this/Actor" parentID="u"><atom label="Actor$0"/><atom label="Actor$1"/></sig>
      <sig ID="resource" label="this/Resource" parentID="u"><atom label="Resource$0"/></sig>
      ${field('id', 'id', 'actor', ['actor', 'i'], tuple('Actor$0', '1') + tuple('Actor$1', '2'), false)}
      ${field('phase', 'phase', 'actor', ['actor', 's'], tuple('Actor$0', phases[0]) + tuple('Actor$1', phases[1]))}
      ${field('messages', 'messages', 'actor', ['actor', 'actor', 'i'], index === 1 ? tuple('Actor$0', 'Actor$1', '7') : index === 2 ? tuple('Actor$1', 'Actor$0', '7') : '')}
      ${field('pending', 'pending', 'actor', ['actor', 'actor', 'resource'], index === 1 ? tuple('Actor$0', 'Actor$1', 'Resource$0') : index === 3 ? tuple('Actor$1', 'Actor$0', 'Resource$0') : '')}
      ${field('owner', 'owner', 'resource', ['resource', 'actor'], index >= 2 ? tuple('Resource$0', index === 2 ? 'Actor$0' : 'Actor$1') : '')}
      ${field('action', 'action', 'actor', ['actor', 'resource', 's'], index === 1 ? tuple('Actor$0', 'Resource$0', '"Acquire"') : index === 2 ? tuple('Actor$0', 'Resource$0', '"Release"') : '')}
    </instance>`;
  };
  let xml = `<alloy>${Array.from({ length: options.static || options.selfLoop ? 1 : 4 }, (_, i) => instance(i)).join('')}<source filename="protocol.als" content="${escape('module protocol\nsig Actor {\n  var messages: Actor -> Int,\n  var pending: Actor -> Resource,\n  var phase: one String,\n  var action: Resource -> String,\n  id: one Int\n}\nsig Resource { var owner: lone Actor }\nrun {} for 3\n')}"/></alloy>`;
  if (options.rename) xml = xml.replaceAll('Actor$0', 'Actor$9').replaceAll('Actor$1', 'Actor$8').replaceAll('Resource$0', 'Resource$9');
  return xml;
}
