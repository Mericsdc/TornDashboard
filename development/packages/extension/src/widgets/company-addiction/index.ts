import { widget } from '../base';
import { note, stat, time } from '../../core/dom';
export const companyAddiction = widget({ id: 'company-addiction', title: 'Company · Employee Addiction', defaultPosition: 'right', defaultOrder: 80, modes: ['NORMAL'], visible: context => Boolean(context.snapshot?.company?.isDirector) }, context => {
  const company = context.snapshot!.company!;
  if (!company.observedAt || context.now - company.observedAt > 5 * 60000) return [note('Company observation stale · waiting for BOSBOT')];
  return [note(`${company.name} · seen ${time(company.observedAt)}`), note('Addiction effect on employee effectiveness · raw addiction points are unavailable'), ...[...company.employees].sort((a,b) => Math.abs(b.addictionEffect || 0) - Math.abs(a.addictionEffect || 0)).map(employee => stat(employee.name, employee.addictionEffect === null ? 'Unknown' : String(employee.addictionEffect))), ...(!company.employees.length ? [note('Employee details were not supplied by BOSBOT')] : [])];
});
