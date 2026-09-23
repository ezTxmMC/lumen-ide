/**
 * Stands in for `aws-ssl-profiles`, the Amazon RDS certificate bundle mysql2
 * loads for its deprecated `ssl: 'Amazon RDS'` profile. The extension passes
 * TLS options itself (and a CA file where needed); the bundle would only add
 * weight.
 */
export const ca = []
export default { ca }
