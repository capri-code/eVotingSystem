import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RegisterVoterDialogComponent } from './register-voter-dialog.component';

describe('RegisterVoterDialogComponent', () => {
  let component: RegisterVoterDialogComponent;
  let fixture: ComponentFixture<RegisterVoterDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterVoterDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RegisterVoterDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
