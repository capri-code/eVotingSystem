import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray, FormControl } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SHARED_IMPORTS } from '../../../shared-imports';

@Component({
  selector: 'app-register-voter-dialog',
  imports: [
    SHARED_IMPORTS
  ],
  templateUrl: './register-voter-dialog.component.html',
  styleUrl: './register-voter-dialog.component.scss'
})
export class RegisterVotersDialogComponent implements OnInit {
  votersForm: FormGroup;
  addressInput = new FormControl('', [
    Validators.required,
    Validators.pattern(/^0x[a-fA-F0-9]{40}$/)
  ]);
  voterAddresses: string[] = [];
  bulkInput = '';
  inputMode: 'single' | 'bulk' = 'single';
  
  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<RegisterVotersDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { electionId: number, electionName: string },
    private snackBar: MatSnackBar
  ) {
    this.votersForm = this.fb.group({
      addresses: this.fb.array([])
    });
  }

  ngOnInit() {}

  get addressesArray(): FormArray {
    return this.votersForm.get('addresses') as FormArray;
  }

  addAddress() {
    const address = this.addressInput.value?.trim();
    
    if (!address) {
      this.snackBar.open('Vendosni një adresë', 'OK', { duration: 2000 });
      return;
    }

    if (!this.isValidAddress(address)) {
      this.snackBar.open('Adresë e pavlefshme! Duhet të fillojë me 0x dhe të ketë 40 karaktere hex', 'OK', { 
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    if (this.voterAddresses.includes(address)) {
      this.snackBar.open('Kjo adresë është shtuar tashmë', 'OK', { 
        duration: 2000,
        panelClass: ['warning-snackbar']
      });
      return;
    }

    this.voterAddresses.push(address);
    this.addressInput.reset();
    
    this.snackBar.open('Adresa u shtua me sukses', 'OK', { 
      duration: 1500,
      panelClass: ['success-snackbar']
    });
  }

  removeAddress(index: number) {
    this.voterAddresses.splice(index, 1);
  }

  processBulkInput() {
    const lines = this.bulkInput.split('\n').filter(line => line.trim());
    const validAddresses: string[] = [];
    const invalidAddresses: string[] = [];
    
    lines.forEach(line => {
      const address = line.trim();
      if (this.isValidAddress(address)) {
        if (!this.voterAddresses.includes(address) && !validAddresses.includes(address)) {
          validAddresses.push(address);
        }
      } else if (address) {
        invalidAddresses.push(address);
      }
    });

    if (invalidAddresses.length > 0) {
      this.snackBar.open(
        `${invalidAddresses.length} adresa të pavlefshme u injoruan`, 
        'OK', 
        { duration: 3000, panelClass: ['warning-snackbar'] }
      );
    }

    if (validAddresses.length > 0) {
      this.voterAddresses.push(...validAddresses);
      this.bulkInput = '';
      this.snackBar.open(
        `${validAddresses.length} adresa u shtuan me sukses`, 
        'OK', 
        { duration: 2000, panelClass: ['success-snackbar'] }
      );
      this.inputMode = 'single';
    }
  }

  isValidAddress(address: string): boolean {
    const pattern = /^0x[a-fA-F0-9]{40}$/;
    return pattern.test(address);
  }

  formatAddress(address: string): string {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }

  onSubmit() {
    if (this.voterAddresses.length === 0) {
      this.snackBar.open('Shtoni të paktën një adresë votimi', 'OK', { 
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      return;
    }

    this.dialogRef.close({
      addresses: this.voterAddresses
    });
  }

  onCancel() {
    this.dialogRef.close();
  }

  clearAll() {
    this.voterAddresses = [];
    this.addressInput.reset();
    this.bulkInput = '';
  }

  switchInputMode(mode: 'single' | 'bulk') {
    this.inputMode = mode;
  }

  getAddressError(): string {
    if (this.addressInput.hasError('required')) {
      return 'Adresa është e detyrueshme';
    }
    if (this.addressInput.hasError('pattern')) {
      return 'Formati: 0x + 40 karaktere hexadecimal';
    }
    return '';
  }
}