// "@angular/compiler" enables the Angular JIT compiler so templates compile in
// the browser without an Angular build plugin. It must be imported before the
// app bootstraps.
import "@angular/compiler";
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app.component";
import { appConfig } from "./app.config";
import "./styles.css";

bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {
    console.error(error);
});
