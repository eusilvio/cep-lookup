
import { Injectable, Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { CepLookup, Address, Provider } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider, apicepProvider } from "@eusilvio/cep-lookup/providers";

// 1. Angular Fetcher Service
@Injectable({
  providedIn: 'root',
})
export class AngularFetcherService {
  constructor(private http: HttpClient) {}

  createFetcher(): (url: string) => Promise<any> {
    return async (url: string) => {
      return this.http.get(url).pipe(
        map(response => response),
        catchError(error => {
          console.error('HTTP Error:', error);
          return throwError(() => new Error(`Failed to fetch from ${url}: ${error.message}`));
        })
      ).toPromise(); // Convert Observable to Promise
    };
  }
}

// 2. CepLookup Service (optional, but good practice for reusability)
@Injectable({
  providedIn: 'root',
})
export class CepLookupService {
  private cepLookupInstance: CepLookup;

  constructor(private fetcherService: AngularFetcherService) {
    this.cepLookupInstance = new CepLookup({
      providers: [viaCepProvider, brasilApiProvider, apicepProvider],
    });
  }

  lookupCep(cep: string): Promise<Address> {
    return this.cepLookupInstance.lookup(cep);
  }
}

// 3. Angular Component
@Component({
  selector: 'app-cep-lookup',
  template: `
    <div>
      <h1>CEP Lookup (Angular)</h1>
      <input
        type="text"
        [(ngModel)]="cep"
        placeholder="Enter CEP"
      />
      <button (click)="handleLookup()" [disabled]="loading">
        {{ loading ? 'Loading...' : 'Lookup' }}
      </button>

      <div *ngIf="address">
        <h2>Address</h2>
        <p><strong>CEP:</strong> {{ address.cep }}</p>
        <p><strong>Street:</strong> {{ address.street }}</p>
        <p><strong>Neighborhood:</strong> {{ address.neighborhood }}</p>
        <p><strong>City:</strong> {{ address.city }}</p>
        <p><strong>State:</strong> {{ address.state }}</p>
        <p><strong>Service:</strong> {{ address.service }}</p>
      </div>

      <div *ngIf="error">
        <h2>Error</h2>
        <p>{{ error }}</p>
      </div>
    </div>
  `,
  styles: [`
    /* Add some basic styling here if needed */
  `]
})
export class CepLookupAngularComponent implements OnInit {
  cep: string = '';
  address: Address | null = null;
  error: string | null = null;
  loading: boolean = false;

  constructor(private cepLookupService: CepLookupService) {}

  ngOnInit(): void {}

  async handleLookup() {
    this.loading = true;
    this.error = null;
    this.address = null;

    try {
      this.address = await this.cepLookupService.lookupCep(this.cep);
    } catch (err) {
      this.error = (err as Error).message;
    } finally {
      this.loading = false;
    }
  }
}

/*
  To use this in an Angular application:

  1. Ensure you have Angular CLI installed and an Angular project set up.
  2. Install necessary packages:
     npm install @angular/common @angular/core @angular/forms rxjs
     npm install @eusilvio/cep-lookup

  3. Import `HttpClientModule` and `FormsModule` in your `app.module.ts`:

     import { BrowserModule } from '@angular/platform-browser';
     import { NgModule } from '@angular/core';
     import { HttpClientModule } from '@angular/common/http';
     import { FormsModule } from '@angular/forms';

     import { AppComponent } from './app.component';
     import { CepLookupAngularComponent } from './angular-example'; // Adjust path as needed

     @NgModule({
       declarations: [
         AppComponent,
         CepLookupAngularComponent
       ],
       imports: [
         BrowserModule,
         HttpClientModule,
         FormsModule
       ],
       providers: [],
       bootstrap: [AppComponent]
     })
     export class AppModule { }

  4. Add `<app-cep-lookup></app-cep-lookup>` to your `app.component.html`.
*/
