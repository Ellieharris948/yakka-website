// Remote suites create and delete fixtures. Keep ordinary test runs read-only
// against YAKKA production and require an explicitly named staging project.
export function remoteE2EEnabled(url: string) {
  const project = new URL(url).hostname.split('.')[0];
  return project !== 'ijjqugzzhhpxujqmkstz'
    && process.env.YAKKA_E2E_PROJECT_REF === project;
}
