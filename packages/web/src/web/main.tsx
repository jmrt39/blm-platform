// Entry point referenced by index.html — composition only, real bootstrap
// lives in __main.tsx (template-managed). lib/auth starts the managed
// redirect check at import time; app.tsx waits on it before loading the session.
import "./lib/auth";
import "./__main";
