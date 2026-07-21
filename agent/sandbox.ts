// Pin the sandbox backend to `justbash` (pure-JS bash over a virtual FS, no daemon / no
// VM). Eve's defaultBackend() probe order is Vercel -> Docker -> microsandbox ->
// justbash; on macOS it selects microsandbox, which then hangs forever prewarming a VM
// with no microsandbox binary installed. justbash needs no daemon/VM and prewarms
// instantly. In a real deploy the default probe picks Vercel/Docker correctly.
import { defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";

export default defineSandbox({
  backend: justbash(),
});
