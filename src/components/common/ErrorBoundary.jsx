// src/components/common/ErrorBoundary.jsx
import React, { Component } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to an error reporting service
    console.error("Component Error:", error, errorInfo);
    this.setState({ errorInfo });
    
    // You could send this to a monitoring service like Sentry
    if (window.gtag) {
      window.gtag('event', 'exception', {
        'description': `${error.name}: ${error.message}`,
        'fatal': false
      });
    }
  }
  
  handleRefresh = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    
    // If the component provided a reset function, call it
    if (this.props.onReset) {
      this.props.onReset();
    }
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI when an error occurs
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <div className="flex items-center mb-2">
            <AlertCircle size={20} className="mr-2" />
            <h3 className="font-bold">Something went wrong</h3>
          </div>
          
          <div className="text-sm mb-3">
            {this.props.fallbackMessage || 
              "We encountered an error in this component. You can try refreshing."}
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={this.handleRefresh}
              className="flex items-center px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
            >
              <RefreshCw size={14} className="mr-1" />
              Try Again
            </button>
            
            {this.props.showReload && (
              <button 
                onClick={() => window.location.reload()}
                className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Reload Page
              </button>
            )}
          </div>
          
          {this.props.debug && (
            <details className="mt-4 text-xs">
              <summary className="cursor-pointer">Error Details (for developers)</summary>
              <pre className="mt-2 p-2 bg-red-100 rounded overflow-auto max-h-40">
                {this.state.error?.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    // When there's no error, render children normally
    return this.props.children;
  }
}

export default ErrorBoundary;