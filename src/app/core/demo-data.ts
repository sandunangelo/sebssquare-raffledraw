import type { Candidate } from './models';
import { joinName, tidyDetail } from './names';

/**
 * Stand-in roster so the stage can be rehearsed without a live sheet. Stored
 * the way the sheet stores it - lower case first name, last name, city - so
 * the demo exercises the same casing path as a real load.
 */
const DEMO_ROWS: readonly (readonly [string, string, string])[] = [
  ['sandun', 'perera', 'panadura'],
  ['angelo', 'silva', 'lunawa'],
  ['malaka', 'rubasingha', 'indibedda'],
  ['shehan', 'fernando', 'idama'],
  ['tony', 'rodrigo', 'idama'],
  ['yohan', 'perera', 'uyana'],
  ['dinesh', 'jayasuriya', 'moratuwa'],
  ['chamara', 'wickramasinghe', 'ratmalana'],
  ['nuwan', 'gunawardena', 'dehiwala'],
  ['kasun', 'abeysekara', 'katubedda'],
  ['thilina', 'mendis', 'angulana'],
  ['ruwan', 'dissanayake', 'soysapura'],
  ['lahiru', 'wijesinghe', 'koralawella'],
  ['pasindu', 'ranasinghe', 'egodauyana'],
  ['isuru', 'bandara', 'rawatawatta'],
  ['charith', 'amarasinghe', 'borupana'],
  ['sahan', 'ekanayake', 'attidiya'],
  ['nipun', 'senanayake', 'mount lavinia'],
  ['hasitha', 'karunaratne', 'kalubowila'],
  ['dilshan', 'weerasinghe', 'nugegoda'],
  ['chathura', 'samarasekara', 'piliyandala'],
  ['tharindu', 'liyanage', 'kesbewa'],
  ['janith', 'hettiarachchi', 'bokundara'],
  ['supun', 'alwis', 'madapatha'],
  ['kavindu', 'goonetilleke', 'werahera'],
  ['sanjaya', 'herath', 'maharagama'],
  ['vikum', 'fonseka', 'wellawatte'],
  ['dulanjana', 'de soyza', 'laxapathiya'],
  ['shanaka', 'kodikara', 'templers road'],
  ['roshan', 'peiris', 'boralesgamuwa'],
];

export function demoCandidates(): Candidate[] {
  return DEMO_ROWS.map(([first, last, city], index) => ({
    id: `demo${index}`,
    name: joinName(first, last),
    detail: tidyDetail(city),
  }));
}
