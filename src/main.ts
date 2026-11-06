import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter,withInMemoryScrolling } from '@angular/router';
import { AppComponent } from './app/app.component';
import { appRoutes } from './app/app.routes';

bootstrapApplication(AppComponent, { providers: [provideRouter(appRoutes,withInMemoryScrolling({scrollPositionRestoration:'enabled'}))] }).catch(error => console.error(error));
