
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Period } from '../period-config';
import { useState } from 'react';
import { DataSelect } from '@/components/primitives/interactions/data-select';
import { PeriodType } from '@/amplify/data/constants';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircleIcon } from 'lucide-react';
import EquipmentTypeList from './equipment-type-list';
import { TextInputWithLabel } from '@/components/primitives/interactions/text-input-with-label';
import { Button } from '@/components/ui/button';
import generateClient from '@/app/utils/generate-client';
import handleError from '@/app/utils/handle-error';
import { toast } from 'sonner';

export default function NewRequest({ periods }: { periods: Period[] }) {
    const [periodId, setPeriodId] = useState('');
    const [selectedEquipmentTypeIds, setSelectedEquipmentTypeIds] = useState<string[]>([]);
    const [collateral, setCollateral] = useState('');

    const [isLoading, setIsLoading] = useState(false);

    const selectedPeriod = periodId != '' ? periods.find(p => p.id == periodId) : null;

    const canSubmit = (
        selectedPeriod &&
        selectedEquipmentTypeIds.length > 0 &&
        !selectedEquipmentTypeIds.includes('') &&
        collateral != ''
    );

    const handleSubmit = async () => {
        if (!canSubmit || isLoading) return;

        setIsLoading(true);

        try {
            const client = generateClient();

            // Read the latest period state rather than trusting the initial page data.
            const { data: currentPeriod, errors: periodErrors } =
                await client.models.Period.get({ id: periodId });

            if (periodErrors?.length) {
                handleError(periodErrors);
                toast.error('Unable to verify the loaning period. Please try again.');
                return;
            }

            if (!currentPeriod) {
                toast.error('This loaning period could not be found. Please refresh the page.');
                return;
            }

            const endTime = Date.parse(currentPeriod.endDateTime);

            if (
                currentPeriod.acceptingRequests !== true ||
                !Number.isFinite(endTime) ||
                Date.now() >= endTime
            ) {
                toast.error('This loaning period is no longer accepting requests.');
                return;
            }

            const request = await client.models.Request.create({
                periodId,
                collateralDescription: collateral,
            });

            if (request.errors) {
                handleError(request.errors);
                return;
            }

            const requestId = request.data?.id;
            if (!requestId) {
                handleError('Expected nonnull returned requestId, but got null');
                return;
            }

            const equipmentTypeRequests = await Promise.all(selectedEquipmentTypeIds.map((equipmentTypeId, i) =>
                client.models.EquipmentTypeRequest.create({ equipmentTypeId, requestId, rank: i + 1 })
            ));

            let hasErrors = false;
            equipmentTypeRequests.forEach(({ errors }) => {
                if (errors) {
                    handleError(errors);
                    hasErrors = true;
                }
            });

            if (!hasErrors) {
                setPeriodId('');
                setSelectedEquipmentTypeIds([]);
                setCollateral('');

                toast.info('Request created (reload page to see updates)');
            }
        } catch (error) {
            handleError(error instanceof Error ? error.message : 'Unexpected error while submitting request');
            toast.error('Request submission failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Card className='gap-4 mb-4'>
            <CardHeader>
                <CardTitle>Create New Request</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col gap-6'>
                <DataSelect
                    inputID='new-request-period'
                    placeholder='e.g. Immerse the Bay 2025'
                    label='Loaning Period'
                    queryData={async () => periods.map(p => ({
                        label: p.name,
                        value: p.id
                    }))}
                    value={periodId}
                    onChange={setPeriodId}
                />
                {
                    selectedPeriod?.periodType == PeriodType.APPROVAL &&
                    <Alert>
                        <AlertCircleIcon />
                        <AlertTitle>Loaning Period not supported</AlertTitle>
                        <AlertDescription>
                            This loaning period is set to general loaning (non-hackathon) which is not yet supported.
                            Please contact an administrator if you think this is a mistake.
                        </AlertDescription>
                    </Alert>
                }
                {
                    selectedPeriod?.periodType == PeriodType.MATCH &&
                    (
                        selectedPeriod.loanableEquipment.length == 0 ?
                            <Alert>
                                <AlertCircleIcon />
                                <AlertTitle>No loanable equipment for this period</AlertTitle>
                                <AlertDescription>
                                    No equipment is listed under this period. This is likely a mistake on our end;
                                    please reach out to an administrator.
                                </AlertDescription>
                            </Alert>
                            :
                            <>
                                <EquipmentTypeList
                                    period={selectedPeriod}
                                    selectedEquipmentTypeIds={selectedEquipmentTypeIds}
                                    setSelectedEquipmentTypeIds={setSelectedEquipmentTypeIds}
                                />

                                <TextInputWithLabel
                                    inputID='new-request-collateral'
                                    label='Specify the collateral you intend to provide'
                                    description={`
                                        We ask all individuals to provide a form of collateral (e.g. driver's license,
                                        passport, ID card, Stanford ID cards, etc.), which will be returned once
                                        the equipment is returned to us.
                                    `}
                                    value={collateral}
                                    onChange={setCollateral}
                                    isRequired={true}
                                    placeholder="e.g. Jane Stanford's drivers license"
                                />

                                <Button
                                    disabled={isLoading || !canSubmit}
                                    onClick={handleSubmit}
                                >
                                    Submit Request
                                </Button>
                            </>
                    )
                }
            </CardContent>
        </Card>
    )
}
