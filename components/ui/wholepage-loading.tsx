import React from 'react';
import { Spinner } from './spinner';

export const WholePageLoading: React.FC = () => {
    return (
        <div className="flex items-center justify-center w-full h-screen bg-white">
            <div className="flex flex-col items-center gap-4">
                <Spinner />
                <p className="text-gray-600 text-lg">Loading...</p>
            </div>
        </div>
    );
};