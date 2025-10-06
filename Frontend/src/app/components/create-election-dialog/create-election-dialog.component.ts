import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SHARED_IMPORTS } from '../../../shared-imports';

@Component({
  selector: 'app-create-election-dialog',
  imports: [
    SHARED_IMPORTS
  ],
  templateUrl: './create-election-dialog.component.html',
  styleUrl: './create-election-dialog.component.scss'
})
export class CreateElectionDialogComponent implements OnInit {
  electionForm: FormGroup;
  minDate = new Date();
  maxDate = new Date();
  
  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<CreateElectionDialogComponent>,
    private snackBar: MatSnackBar
  ) {
    // Set max date to 2 years from now
    this.maxDate.setFullYear(this.maxDate.getFullYear() + 2);
    
    this.electionForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
      startDate: ['', Validators.required],
      startTime: ['', Validators.required],
      endDate: ['', Validators.required],
      endTime: ['', Validators.required]
    });
  }

  ngOnInit() {
    // Set default times
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    
    const endDate = new Date(tomorrow);
    endDate.setDate(endDate.getDate() + 7);
    endDate.setHours(18, 0, 0, 0);
    
    this.electionForm.patchValue({
      startDate: tomorrow,
      startTime: '09:00',
      endDate: endDate,
      endTime: '18:00'
    });
  }

  onSubmit() {
    if (this.electionForm.invalid) {
      this.snackBar.open('Ju lutem plotësoni të gjitha fushat e kërkuara', 'OK', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      return;
    }

    const formValue = this.electionForm.value;
    
    // Combine date and time
    const startDateTime = this.combineDateAndTime(formValue.startDate, formValue.startTime);
    const endDateTime = this.combineDateAndTime(formValue.endDate, formValue.endTime);
    
    // Validate dates
    if (startDateTime >= endDateTime) {
      this.snackBar.open('Data e përfundimit duhet të jetë pas datës së fillimit', 'OK', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }
    
    if (startDateTime < new Date()) {
      this.snackBar.open('Data e fillimit nuk mund të jetë në të kaluarën', 'OK', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }
    
    // Return the data
    this.dialogRef.close({
      name: formValue.name,
      description: formValue.description,
      startTime: startDateTime,
      endTime: endDateTime
    });
  }

  private combineDateAndTime(date: Date, time: string): Date {
    const result = new Date(date);
    const [hours, minutes] = time.split(':').map(Number);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  onCancel() {
    this.dialogRef.close();
  }

  getErrorMessage(field: string): string {
    const control = this.electionForm.get(field);
    
    if (control?.hasError('required')) {
      return 'Kjo fushë është e detyrueshme';
    }
    
    if (control?.hasError('minlength')) {
      const minLength = control.errors?.['minlength'].requiredLength;
      return `Minimumi ${minLength} karaktere`;
    }
    
    if (control?.hasError('maxlength')) {
      const maxLength = control.errors?.['maxlength'].requiredLength;
      return `Maksimumi ${maxLength} karaktere`;
    }
    
    return '';
  }
}
